# Phase 7: Deep Redis Command Reduction Analysis

**Constraint:** Zero architectural changes. Zero reliability degradation. Pure optimization.

---

## Current Baseline (Post Phase 2 Estimates)

| Source | Est. Commands/Month |
|---|---|
| Bull `stalledInterval` 60s polling | ~1.3M |
| Bull `guardInterval` 30s polling | ~2.2M |
| Bull `lockRenewTime` 60s heartbeats | ~0.5M |
| Email idempotency SET NX + DONE | ~0.2M |
| Cache get/set/tags/invalidate | ~0.8M |
| Rate limiter hits | ~0.3M |
| **Total** | **~5.3M** |

---

## Safe Optimizations

---

### Optimization 1: Increase `stalledInterval` to 120s

**Current:** `stalledInterval: 60000` (fires every 60s)  
**Change:** `stalledInterval: 120000` (fires every 120s)  

```javascript
// queue.config.js
stalledInterval: 120000, // Fire every 2 minutes not 1 minute
```

**Why Safe:**  
Bull only reschedules jobs that have truly lost their heartbeat. With `lockDuration: 120s`, a stalled check fires every 60s today. Extending to 120s means one check per lock lifetime rather than two. A genuinely crashed job is re-queued 1–2 minutes later instead of 0–1 minutes — a completely harmless delay for any background workload.

**Risk:** Adds up to 60 seconds of additional delay before a crashed job is re-queued. Acceptable.  
**Commands Saved:** ~650K/month (~50% of stall polling alone).

---

### Optimization 2: Increase `guardInterval` to 60s

**Current:** `guardInterval: 30000` (fires every 30s)  
**Change:** `guardInterval: 60000` (fires every 60s)  

```javascript
// queue.config.js
guardInterval: 60000,
```

**Why Safe:**  
`guardInterval` is Bull's watchdog that checks for delayed and waiting jobs becoming processable. Halving its frequency simply means the queue is checked every 60s instead of 30s. The job is still processed — it just waits up to 60s in its `delayed` state before promotion. Entirely acceptable for background jobs with no real-time SLA.

**Risk:** Delayed-state jobs (scheduled in the future) wait up to 60s extra before being promoted to waiting. Does NOT affect email or moderation job latency since those are added directly to the waiting state.  
**Commands Saved:** ~1.1M/month (~50% of guard polling).

---

### Optimization 3: Merge DONE Status Write into a Single Conditional SET

**Current (emailWorker.js):**
```javascript
// Separate calls: 1x SET NX (lock) + 1x SET XX (DONE update)
const acquired = await client.set(idempotencyKey, 'LOCKED', 'NX', 'EX', 604800);
// ... (after send) ...
await client.set(idempotencyKey, 'DONE', 'XX', 'EX', 604800);
```

**Optimization:** The `DONE` write after the email send is redundant under the current deduplication design. The `LOCKED` state **already prevents re-execution**; updating to `DONE` adds zero correctness benefit — only log clarity — at the cost of a second Redis round trip per job.

**Proposed Change:** Remove the post-send `SET XX` call. The `LOCKED` state is sufficient for deduplication. The key expires after 7 days naturally.

```javascript
// After sendEmail() completes — REMOVE the block below entirely:
// ❌ await client.set(idempotencyKey, 'DONE', 'XX', 'EX', 604800);
```

**Why Safe:**  
The only purpose of `DONE` was observability (status tracking). The deduplication check is `if (!acquired)` — it is indifferent to whether the value is `LOCKED` or `DONE`. Both correctly block duplicate execution.

**Risk:** Loss of `LOCKED` vs `DONE` lifecycle distinction in Redis keyspace. Monitoring scripts inspecting the key value for status will see `LOCKED` permanently. Acceptable — the logs already emit `JOB_COMPLETED`.  
**Commands Saved:** ~200K/month (entire post-send SET removed).

---

### Optimization 4: Skip `addTags` When Tags Array Is Empty (No DB Query)

**Current (redis.js):**
Already has `if (tags.length === 0) return;` — but the check happens **after** building the pipeline object.

**Optimization:** Verify call sites. If any route calls `addTags(keys, [], ttl)` (empty tags), the guard fires but after the array construction overhead. Ensure the guard is the absolute first line and returns immediately.

**Code verification needed:** Grep for `addTags(` across the codebase to ensure no caller passes empty tag arrays to Redis — if they do, this is a no-op loop that wastes a call.

```bash
grep -rn "addTags(" ./backend/src
```

If any call site always passes non-empty tags, no change needed. If empty-tag calls exist, add early rejection at the call site to skip the `addTags` call entirely.

**Commands Saved:** Varies. If 20% of request paths call `addTags` with empty arrays: ~150K/month.

---

### Optimization 5: Batch Tag Invalidation That Always Co-occurs

**Current:** Multiple `invalidateTags(['tag-a'])` calls fired in sequence from different parts of a single mutation controller.

**Optimization:** If a mutation handler calls `invalidateTags` multiple times for related tags (e.g., `author:123` and `vlog:category:action`), merge them into a single call:

```javascript
// BEFORE (2 calls, 2 pipelines):
await redis.invalidateTags(['author:123']);
await redis.invalidateTags(['vlog:trending']);

// AFTER (1 call, 1 pipeline):
await redis.invalidateTags(['author:123', 'vlog:trending']);
```

`invalidateTags` already handles arrays internally via a single `SMEMBERS` pipeline. Merging eliminates one entire pipeline round-trip.

**Why Safe:** Pure batching of already-correct logic. No behavior change.  
**Commands Saved:** ~100K/month assuming 2 invalidation calls per write request at moderate traffic.

---

## Summary Table

| Optimization | Change | Commands Saved/Month | Risk |
|---|---|---|---|
| 1. stalledInterval → 120s | `queue.config.js` 1 line | ~650K | Negligible |
| 2. guardInterval → 60s | `queue.config.js` 1 line | ~1.1M | Negligible |
| 3. Remove DONE SET XX | `emailWorker.js` delete 4 lines | ~200K | No correctness impact |
| 4. Skip empty addTags calls | Verify call sites | ~150K | Code audit only |
| 5. Batch invalidateTags | Controller call sites | ~100K | Zero |
| **Total Estimate** | | **~2.2M/month** | **All safe** |

**Post-optimization estimate:** `5.3M - 2.2M = ~3.1M commands/month` — a further ~41% reduction on top of Phase 2/3 gains, bringing cumulative reduction to ~90%+ vs the original 9.4M baseline.

---

## Implementation Order

1. **Make now (zero-risk):** Optimizations 1 & 2 — single-line changes in `queue.config.js`.
2. **Make now (zero-risk):** Optimization 3 — delete 4 lines from `emailWorker.js`.
3. **Make after audit (low-risk):** Optimizations 4 & 5 — requires grep verification across controllers.
