# Phase 6: Incremental Redis Dependency Reduction Plan

## Objective
Reduce Redis usage to near-zero by replacing non-critical dependencies with in-memory and database-backed alternatives, incrementally and reversibly, without breaking production.

---

## Migration Order (Safest → Riskiest)

| Phase | What Changes | Risk | Redis Impact |
|---|---|---|---|
| 6.1 | Rate Limiter → In-Memory | Low | ~5% reduction |
| 6.2 | Idempotency → MongoDB | Medium | ~15% reduction |
| 6.3 | Cache → In-Memory (LRU) | Medium | ~30% reduction |
| 6.4 | Bull → In-Memory Queues | High | ~50% remaining |
| 6.5 | Redis Decommission | Final | ~100% removed |

---

## Phase 6.1 — Rate Limiter Migration (In-Memory)

### Strategy
Replace `express-rate-limit` with a Redis store for a pure in-memory store.

```javascript
// BEFORE (Redis-backed)
const { RedisStore } = require("rate-limit-redis");
app.use(rateLimiter({ store: new RedisStore({ client: redisClient }) }));

// AFTER (In-memory — no dependency needed)
const rateLimiter = require("express-rate-limit");
app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 })); // Default store is in-memory
```

### Tradeoffs
- **Limitation:** Rate limits are NOT globally enforced across multiple API server instances. A user can bypass the limit by having requests distributed across pods.
- **Acceptable for:** Low-to-moderate traffic with 1–2 API instances.
- **Not acceptable for:** High-traffic systems with horizontal API scaling.

### Rollback
Restore the `store: new RedisStore(...)` option. No data migration needed.

---

## Phase 6.2 — Idempotency Migration (MongoDB)

### Strategy
Replace Redis `SET NX` with a MongoDB unique index on a new `IdempotencyKey` collection.

**New Collection:**
```javascript
// models/IdempotencyKey.js — schema outline
{
  key: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['LOCKED', 'DONE'], default: 'LOCKED' },
  createdAt: { type: Date, expires: '7d' } // TTL index auto-removes expired docs
}
```

**Worker Usage:**
```javascript
// BEFORE: Redis NX lock
const acquired = await redis.set(idempotencyKey, 'LOCKED', 'NX', 'EX', 86400 * 7);

// AFTER: MongoDB unique index acts as atomic NX
try {
  await IdempotencyKey.create({ key: idempotencyKey, status: 'LOCKED' });
} catch (e) {
  if (e.code === 11000) return { success: true, duplicate: true }; // Unique index collision = duplicate
  throw e;
}
```

### Dual-Run Strategy
Run both Redis and MongoDB checks simultaneously for 1 week to verify equivalence before removing the Redis check.

### Risks
- **MongoDB latency** (~2–5ms) is marginally higher than Redis (~0.5ms) for idempotency checks.
- **MongoDB connection failures** will block job logic where Redis failures were silent.

### Rollback
Remove the `IdempotencyKey.create()` call. Drop the collection. No side effects to existing queue state.

---

## Phase 6.3 — Cache Migration (In-Memory LRU)

### Strategy
Replace the Redis tag-based cache with a node-local LRU cache using the built-in `lru-cache` package (already very common in Node.js ecosystems).

```javascript
const { LRUCache } = require('lru-cache');
const cache = new LRUCache({ max: 500, ttl: 1000 * 300 }); // 500 entries, 5-min TTL

// safeGet equivalent
const data = cache.get(key);

// safeSet equivalent
cache.set(key, value, { ttl: 1000 * 60 }); // Per-item TTL override

// Tag Invalidation equivalent
// Store: Map<tag, Set<key>>
// On mutation: invalidate all keys in the tag's set
```

### Tradeoffs
- **Cache is NOT shared across API instances.** Each server maintains its own LRU independently — duplicate DB queries possible during cache warming after pod restarts.
- **Memory Bounded.** Max 500 entries keeps memory impact negligible.
- **Tag invalidation** requires maintaining a local `Map<tag, Set<key>>` that is also cleared on `lru-cache` TTL evictions (requires a `dispose` callback on the LRU).

### Rollback
Route `getJSON`/`setJSON`/`addTags`/`invalidateTags` calls back to the Redis client singleton. No data loss risk since caches are ephemeral.

---

## Phase 6.4 — Queue Migration (Bull → `fastq`)

> **WARNING: Highest risk step. Perform last.**

### Strategy
Replace Bull email queue (least critical) with `fastq` — a fast, in-memory FIFO worker queue with zero Redis dependency.

```javascript
// BEFORE: Bull
const emailQueue = createQueue('email');
emailQueue.add(payload);
emailQueue.process(async (job) => { ... });

// AFTER: fastq
const fastq = require('fastq');
const emailQueue = fastq.promise(async (payload) => { ... }, 1); // concurrency=1
emailQueue.push(payload);
```

**Dual-Run Approach:**  
Keep Bull running in parallel during transition:
```javascript
const USE_FASTQ = process.env.USE_FASTQ_EMAIL === 'true'; // Feature flag

if (USE_FASTQ) {
  fastqEmailQueue.push(payload);
} else {
  await bullEmailQueue.add(payload);
}
```

### Critical Tradeoffs
| Feature | Bull | fastq |
|---|---|---|
| Job persistence across crashes | ✅ Yes | ❌ No — jobs lost on process exit |
| Retry on failure | ✅ Automatic | 🟡 Manual (try/catch + re-push) |
| Horizontal workers | ✅ Yes | ❌ No (per-process only) |
| Stall detection | ✅ Yes | ❌ No |
| Redis dependency | ❌ Required | ✅ None |

> **Verdict:** `fastq` is safe ONLY if email jobs are idempotent AND occasional drops are acceptable (e.g., password reset emails can be re-requested by users). Do NOT migrate moderation or account deletion queues to `fastq` — they require crash persistence.

### Rollback
Set `USE_FASTQ_EMAIL=false` in environment variables. Workers immediately route to Bull again. Zero data migration needed.

---

## Phase 6.5 — Redis Decommission

After all phases are stable:
1. Remove the `ioredis` import and `createRedisClient` calls once the last queue or rate limiter no longer depends on it.
2. Remove `redisSubscriber` and `bclient` connections.
3. Update `server.js` to remove `connectRedis()` call.
4. Remove `REDIS_URL` from `.env`.

> **Check before removing:** `grep -r "redis\|Redis\|ioredis\|bull\|Bull" ./src` to confirm zero remaining references.

---

## Risk Summary

| Phase | Can Break | Mitigation |
|---|---|---|
| 6.1 Rate Limiter | Global limit bypass in multi-pod | Document; only proceed for single-instance deployments |
| 6.2 Idempotency | MongoDB downtime drops lock acquisition | Keep Redis as fallback during dual-run |
| 6.3 Cache | Cold start invalidation cross-pod | LRU warms quickly; acceptable degradation |
| 6.4 Queues | Job loss on crash (fastq) | Use feature flag; never migrate moderation/deletion |
| 6.5 Decommission | Lingering imports cause runtime errors | Grep-verify before commit |

---

## Final Summary

This plan preserves correctness at each step through dual-running both old and new systems simultaneously using environment-variable feature flags, eliminating any hard cutover risk. Each phase is independently reversible within minutes.
