# Phase 4: Validation Test Plan & Scripts

This guide provides exactly reproducible, step-by-step instructions and minimal code implants to prove the system is fully failure-safe under real-world stress conditions. 

---

## 1. Idempotency Test

**Goal:** Prove that firing the exact same logical payload multiple times concurrently *and delayed* results in exactly one side effect.

**Setup Script (`test-idemp.js`):**
Save this file in the project root and run it via `node test-idemp.js` while the server and workers are running.
```javascript
const { createQueue } = require('./backend/src/config/queue.config');
const emailQ = createQueue('email');

(async () => {
  const payload = { to: 'test@example.com', subject: 'Idemp Test', html: 'Hi' };
  
  // Fire 3 identical jobs concurrently
  await Promise.all([
    emailQ.add(payload),
    emailQ.add(payload),
    emailQ.add(payload)
  ]);
  console.log('Fired 3 identical jobs concurrently.');

  // NEW: Fire 1 delayed duplicate to verify time-resistant idempotency
  setTimeout(async () => {
    await emailQ.add(payload);
    console.log('Fired 1 delayed identical job.');
    process.exit(0);
  }, 3000);
})();
```

**Worker Implant (Side-effect Mock):**
In `backend/src/workers/emailWorker.js`, temporarily add a global counter `let sendCounter = 0;` at the top. Before `resend.emails.send(...)`, add:
```javascript
sendCounter++;
console.log(`[MOCK SIDE-EFFECT] Actually sent email. Total lifetime sends: ${sendCounter}`);
```

**Expected Output (in Worker Terminal):**
* Worker instantly picks up all jobs.
* `[MOCK SIDE-EFFECT]` logs **exactly once**. Lifetime sends remain `1`.
* `Duplicate email job payload detected and prevented` logs **three times** (two from concurrency, one from the delayed job).

**Failure Signal:** Multiple `[MOCK SIDE-EFFECT]` logs; multiple emails delivered.

---

## 2. Crash Simulation Test (CRITICAL)

**Goal:** Prove the "side-effect vs state boundary". If a worker explodes mid-execution, we must drop the job rather than re-send a duplicate, validating real-world side-effect correctness.

**Code Implant (Temporary):**
In `backend/src/workers/emailWorker.js`, temporarily add this block right before the `[MOCK SIDE-EFFECT]` block:
```javascript
    if (subject === 'CRASH_TEST') {
      console.log('CRASHING NODE.JS PROCESS IN 500MS...');
      setTimeout(() => process.exit(1), 500);
    }
```

**Execution Steps:**
1. Start the worker (`npm run dev`). Look for `Total lifetime sends: 0`.
2. Queue a job with `subject: 'CRASH_TEST'`.
3. Worker locks the idempotency key, then instantly crashes and exits. Side-effect is NEVER reached.
4. Restart the worker immediately (`npm run dev`).
5. **Wait 60 seconds.** Bull's `stalledInterval` checker will detect the dead lock and resurrect the job.

**Expected Output:**
* After 60s, the worker picks up the resurrected job.
* Worker logs: `Duplicate email job payload detected and prevented`. 
* Ensure `[MOCK SIDE-EFFECT]` is never logged. The job safely concludes without sending *any* emails (dropped safely).

**Failure Signal:** The resurrected job attempts to send the email, resulting in the side-effect finally executing (which breaks our "drop vs duplicate" tradeoff commitment).

---

## 3. Long-Running Job Test

**Goal:** Prove that heavy synchronous or asynchronous tasks don't silently expire their locks and trigger duplicate processing.

**Code Implant (Temporary):**
In `backend/src/workers/moderation.worker.js`, before `await moderationService.moderateVlog(vlogId);`:
```javascript
    if (vlogId === 'ASYNC_TEST') {
      console.log('Simulating long async delay...');
      await new Promise((r) => setTimeout(r, 65000)); // Wait 65 seconds
    }
    
    // NEW: Event loop blocking simulation (Sync Starvation)
    if (vlogId === 'SYNC_BLOCK_TEST') {
      console.log('Simulating synchronous event loop starvation for 10s...');
      const start = Date.now();
      while (Date.now() - start < 10000) {} // CPU-bound block
    }
```

**Execution Steps:**
1. Manually insert generic Bull jobs into the moderation queue with `vlogId: 'ASYNC_TEST'` and then `vlogId: 'SYNC_BLOCK_TEST'`.
2. Watch the logs.

**Expected Output:**
* **Async Test:** Worker processes for 65s. Bull automatically renews lock via background `setInterval`. No `stalled` event fires. Warnings log normally.
* **Sync Test:** Worker pauses entirely. `Event loop blocked` logs fire. The lock survives because `10s < lockDuration (120s)`. No duplicate execution.

**Failure Signal:** 
* Bull logs `Lock renewal failed`. 
* `Job stalled` fires before completion resulting in two workers processing the same vlog simultaneously.

---

## 4. Cache Consistency Test

**Goal:** Prove the Redis 7.0+ `GT` parameter correctly prevents short TTLs from permanently crushing long TTLs across overlapping tags, AND prove invalidation succeeds.

**Setup Script (`test-cache.js`):**
```javascript
const { createRedisClient, connectRedis } = require('./backend/src/config/redis');

(async () => {
  const redis = createRedisClient();
  await connectRedis();

  // 1. Set a "list" cache item tagged 'author:xyz' with 1 HOUR TTL
  await redis.set('cache_list_long', 'data1', 'EX', 3600);
  await redis.addTags(['cache_list_long'], ['author:xyz'], 3600);
  
  // 2. Set an "item" cache item tagged 'author:xyz' with 5 SEC TTL
  await redis.set('cache_item_short', 'data2', 'EX', 5);
  await redis.addTags(['cache_item_short'], ['author:xyz'], 5);
  
  console.log('Waiting 6 seconds...');
  await new Promise(r => setTimeout(r, 6000));

  // 3. Prove the tag survived the 5s TTL
  const members = await redis.smembers('author:xyz');
  console.log('Tag contains strictly long item:', members.includes('cache_list_long'));
  console.log('Short item natively expired:', !members.includes('cache_item_short') || await redis.get('cache_item_short') === null);

  // NEW: 4. Prove invalidation works cleanly
  console.log('Simulating mutation -> Invalidating tag...');
  await redis.invalidateTags(['author:xyz']);
  
  const deletedMembers = await redis.smembers('author:xyz');
  const cachedData = await redis.get('cache_list_long');
  console.log('Tag evaporated:', deletedMembers.length === 0);
  console.log('Actual cache keys evaporated:', cachedData === null);

  process.exit(0);
})();
```

**Expected Output:**
```
Waiting 6 seconds...
Tag contains strictly long item: true
Short item natively expired: true
Simulating mutation -> Invalidating tag...
Tag evaporated: true
Actual cache keys evaporated: true
```

**Failure Signal:** `Tag evaporated: true` but `Actual cache keys evaporated: false` — meaning the 5-second `addTags` call overrode the 3600-second TTL, breaking invalidation and stranding stale data in memory.

---

## 5. Redis Load Observability

**Goal:** Prove real-world improvement in idle command volume by comparing against a baseline, without using arbitrary hardcoded numbers.

**Execution Steps:**
1. Briefly revert `src/config/queue.config.js` to Bull defaults (`stalledInterval: 30000` inside each worker's `new Queue()`, no connection sharing).
2. Run `redis-cli INFO STATS | grep instantaneous_ops_per_sec` observation script. Note the baseline number (e.g., `ops: 60`).
3. Restore the Phase 2/3 `queue.config.js` optimizations with consolidated clients and `stalledInterval: 60000`.
4. Run measurement again.

**Expected Output:**
* Ops drop severely by **80-90%** compared to baseline. 

**Failure Signal:**
* Reduction is statistically insignificant compared to unoptimized `new Queue()` scaling.

---

## 6. Critical Additions (NEW)

### a) Idempotency TTL Expiry Test
**Goal:** Prove business logic correctly resets and allows identical payloads after the validity window expires.
**Implant:** Temporarily change the TTL in `emailWorker.js`'s `SET NX` from `86400 * 7` to `2` (2 seconds).
**Steps:**
1. Fire job payload. Verify `[MOCK SIDE-EFFECT]` fires.
2. Wait 3 seconds.
3. Fire identical job payload.
**Expected:** The second job successfully executes `[MOCK SIDE-EFFECT]` again because the business TTL has legally lapsed.
**Failure Signal:** The second job is blocked despite the 3-second delay, indicating memory leaks or manual TTL clearing failures.

### b) Bull Retry Side-Effect Bypass Test
**Goal:** Prove that if Bull initiates a retry due to a post-side-effect crash or random exception, idempotency successfully deflects it.
**Implant:** In `emailWorker.js`, *after* `[MOCK SIDE-EFFECT]` executes but *before* `DONE` is written, throw a raw exception: `throw new Error('Fake Post-Email Exception');`
**Steps:**
1. Fire job. 
2. Job throws error and fails. Bull logs the failure and automatically retries based on `attempts` config.
**Expected:** The subsequent retry triggers `Duplicate email job payload detected` safely and completes smoothly or skips, preventing a second email.

### c) Multi-Worker Concurrency Race Test
**Goal:** Subjugate the entire configuration to extreme parallel strain to hunt for unhandled data races in the DB and Redis locks.
**Steps:**
1. Open **3 separate terminals** representing horizontal scaling. 
2. Run `npm run start` (or equivalent worker spin-up) in all 3 simultaneously.
3. Rapid-fire 5 identical `idemp:email` payload hashes into the backing queue via a standalone loop script.
**Expected:** Exactly **1 worker out of the 3** wins the `SET NX` race. The remaining 4 duplicate jobs distribute across the 3 workers and all politely exit with `duplicate: true`. 
**Failure Signal:** Two distinct terminals log `[MOCK SIDE-EFFECT]` for the same payload hash, proving a microscopic data race in the lock mechanics.
