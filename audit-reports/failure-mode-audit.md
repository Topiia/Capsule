# Failure-Mode Audit Report: Phase 2 Redis Optimization

**Executive Summary**: While the optimization successfully reduced Redis command overhead by ~90% and consolidated connections, a deep failure-mode analysis reveals **critical correctness vulnerabilities**. The assumption that the system is "working correctly" is false under edge conditions. The simplified cache pipeline breaks consistency, and the idempotency mechanisms contain race conditions and fundamental design flaws that guarantee duplicate execution during crashes.

---

## 1. Hidden Bug: Cache Consistency — Unintentional Tag TTL Crushing (CRITICAL)

**Description:** 
The simplified single-pipeline `addTags` implementation unconditionally applies a `300s` (or provided) `EXPIRE` to cache tags, overwriting existing longer TTLs.

**Why it happens:** 
If a long-lived list query (`ttl = 86400`) creates a tag `user:123`, and later a short-lived item query (`ttl = 300`) updates the same `user:123` tag, the new pipeline unconditionally executes `EXPIRE user:123 300`. After 5 minutes, the tag set is deleted. However, the original list cache keys rely on this index and are still alive in Redis for another 24 hours. 

**Impact:** 
**Orphaned cache keys and stale data.** When a mutation occurs, `invalidateTags('user:123')` is called. Because the tag set evaporated prematurely, `SMEMBERS` returns empty, and the backend fails to delete the underlying cache keys. Users will see deeply stale data until the keys naturally expire.

**Reproduction Scenarios:**
1. Fetch `/vlogs` (caches with 24h TTL, tags `author:A`).
2. Fetch `/vlog/123` (caches with 5m TTL, tags `author:A`).
3. Wait 5 minutes and 1 second.
4. User `author:A` deletes their vlog. `invalidateTags('author:A')` tries to clear cache but finds no tag.
5. Fetch `/vlogs` -> Returns the deleted vlog from cache.

**Fix Recommendation:** 
Use the Redis 7.0+ `GT` (Greater Than) flag for conditional expiration: `pipeline.expire(tag, ttl, 'GT')`. This ensures the TTL only extends, never shrinks. If Redis < 7.0, write a small Lua script to perform the conditional update, avoiding the round-trip read-modify-write without risking data loss.

**Confidence Level:** 100% chance of occurring in production with mixed-TTL cache layers.

---

## 2. Hidden Bug: Idempotency — `job.id` Deduplication Flaw (HIGH)

**Description:** 
`emailWorker.js` uses `idemp:email:${job.id}` as the idempotency key.

**Why it happens:** 
`job.id` uniquely identifies an entry in the Bull queue, not the *logical business action*. If a client retries a request, clicks a button twice, or a bug enqueues the same logical email twice, Bull creates *two distinct jobs* with *two different `job.id`s*.

**Impact:** 
Bypasses idempotency entirely for concurrent/duplicate submissions, resulting in spamming users with duplicate emails.

**Reproduction Scenarios:**
1. Client double-clicks "Resend Verification Email".
2. Controller calls `emailQueue.add(...)` twice.
3. Queue creates Job #101 and Job #102.
4. Worker processes both because `idemp:email:101` !== `idemp:email:102`.

**Fix Recommendation:** 
The idempotency key MUST be derived from the deterministic payload, not the queue infrastructure.  
Fix: `const payloadHash = crypto.createHash('sha256').update(to + subject + Date.now()/3600000).digest('hex'); const idempotencyKey = idemp:email:${payloadHash};`

**Confidence Level:** 100% chance of user-triggered duplicates.

---

## 3. Hidden Bug: Idempotency — Late-Set Key & Crash Loops (HIGH)

**Description:** 
`emailWorker.js` sets the `DONE` idempotency flag *after* the email is dispatched via the Resend API.

**Why it happens:** 
Network boundaries are not atomic. If the `sendEmail` API call succeeds, but the Node.js process crashes (e.g., OOM kill, unhandled rejection, container restart) *before* `emailQueue.client.set(idempotencyKey, 'DONE')` executes, the flag is never written.

**Impact:** 
Bull's `stalledInterval` checker will discover the locked job died and re-queue it. The next worker will check the Redis idempotency key, see `null`, and send the email a second time.

**Reproduction Scenarios:**
1. Worker sends email. Resend returns HTTP 200.
2. Simulate infrastructure failure: `kill -9` the Node process.
3. Wait 60 seconds. Bull resurrects the stalled job.
4. Second worker sends the email again.

**Fix Recommendation:** 
Local Redis state cannot protect external side effects from crashes. The ONLY strictly safe fix is passing a formal `Idempotency-Key` HTTP Header to the external provider (if Resend supports it). Alternatively, use `SET NX` before sending to lock the logical payload, which risks dropping the job if it fails before Resend actually receives it (preferable to double-charging/spamming in some domains).

**Confidence Level:** Will definitively occur during any infrastructure deployment, pod rotation, or unhandled exception.

---

## 4. Hidden Bug: Concurrency — Non-Atomic Trust Score Updates (MEDIUM-HIGH)

**Description:** 
`trustScoreService.js` uses a read-modify-write pattern: `let newScore = user.trustScore + impact; await user.save();`.

**Why it happens:** 
Mongoose `save()` explicitly overwrites the document with the properties it loaded. If two moderation jobs process simultaneously for the same user, they both read `trustScore: 50`. Both calculate `51`. Both save `51`. 

**Impact:** 
Lost trust score increments/decrements (data loss) and lost profile updates if a user edits their profile at the exact moment a background worker saves the moderation result.

**Reproduction Scenarios:**
1. Upload Vlog A and Vlog B concurrently.
2. Moderation worker processes both in parallel (concurrency > 1).
3. Both approve and add `+1` trust score.
4. Final score is `51`, missing the second point.

**Fix Recommendation:** 
Enforce atomic database operations for numeric counters. 
Fix: `await User.updateOne({ _id: userId }, { $inc: { trustScore: impact, flagsCount: ... } })`, followed by a separate bounds-checking step or clamped query.

**Confidence Level:** High occurrence in a distributed system with multiple concurrent workers.

---

## 5. Hidden Bug: Locking — Event Loop Starvation Drops Locks (MEDIUM)

**Description:** 
Bull relies on a Node.js `setInterval` heartbeat to send `lockRenewTime` commands to Redis.

**Why it happens:** 
If `moderationService` executes heavy synchronous code (e.g., large JSON payload parsing, heavy Regex rule evaluation, or high CPU utilization saturating the core), the Node.js event loop blocks. If it blocks for longer than `lockDuration`, the `setInterval` heartbeat cannot fire. Redis expires the lock.

**Impact:** 
Bull's master script falsely flags the healthy-but-slow worker as "stalled" and re-queues the job. A second worker picks up the job, leading to parallel execution of heavy CPU bounds tasks, rapidly snowballing into full system exhaustion.

**Reproduction Scenarios:**
1. Submit a massive vlog transcript triggering CPU-heavy Regex.
2. Event loop blocks for 70 seconds.
3. Lock expires at 60s. Second worker picks up job. Both are now crunching regex.

**Fix Recommendation:** 
Offload heavy synchronous CPU bounds tasks to Node `worker_threads`, strictly ensuring the main event loop remains free to process Bull heartbeats and basic health checks.

**Confidence Level:** Low to Medium in low-traffic, but catastrophic if malicious payloads are submitted.
