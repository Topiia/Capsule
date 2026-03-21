# Phase 5: Production Deployment & Rollback Strategy

This document outlines the strictly controlled, conservative deployment sequence for transitioning the Phase 2/3 Redis Optimizations and Failure-Mode fixes into the production environment. 

Safety, observability, and instantaneous rollback capability are prioritized over deployment speed.

---

## 1. Pre-Deployment Checklist

Execute this verification *before* any production merge:
- [ ] **Tests Passed:** All Phase 4 simulation tests (Crash, Long-Running, Concurrency, Cache TTL) executed successfully locally or in staging.
- [ ] **Sanitize Codebase:** Ensure all raw `CRASH_TEST` triggers, delayed `setTimeout` mocks, and `[MOCK SIDE-EFFECT]` logs from Phase 4 testing have been permanently scrubbed from the `main` branch.
- [ ] **Verify Bull Payload:** Confirm `queue.config.js` is actively exporting the centralized `createQueue` factory and enforcing `stalledInterval: 60000`.
- [ ] **Verify Keyspace:** Validate `emailWorker.js` is utilizing deterministic `crypto.createHash` idempotency keys, NOT `job.id` strings.

---

## 2. Staged Rollout Sequence

Do **NOT** perform a global restart. The deployment must be isolated and phased.

### Step 1: Canary Worker Deployment
Deploy the updated codebase to exactly **one** background worker instance first.
```bash
# Example sequence for the canary node
git pull origin main
npm install
pm2 restart worker-canary --update-env
```
*Wait 15-30 minutes.* Allow the canary node to pick up real queue traffic alongside the unoptimized workers. 

### Step 2: API Node Rollout
Deploy the codebase to the API web servers. This activates the simplified, high-performance Redis cache pipelines (`EXPIRE GT`) on live traffic.
```bash
# Example sequence for API nodes
pm2 reload api-server
```

### Step 3: Global Worker Scale Out
If the Canary worker shows 0 errors, 0 stalled jobs, and 0 dropped locks over 30 minutes, deploy to the rest of the worker fleet.
```bash
pm2 reload worker-fleet
```

---

## 3. Active Monitoring Checklist (Copy-Paste Ready)

Have monitoring dashboards open *during* rollout.

**Redis Telemetry:**
- [ ] Check instantaneous command rate: `redis-cli INFO STATS | grep instantaneous_ops_per_sec`. (Expect a drastic drop compared to pre-deployment baseline).
- [ ] Check connection counts: `redis-cli INFO CLIENTS | grep connected_clients`. (Should remain stable and visibly lower than the old unpooled architecture).

**Bull Queue Health:**
- [ ] Monitor **Stalled Jobs**: Should be strictly `0`.
- [ ] Monitor **Failed Jobs**: Should remain aligned with normal baseline exception rates.
- [ ] Monitor **Active/Waiting**: Ensure no bizarre backlogs develop indicating frozen workers.

**Application Log Tails:**
Search your centralized logging (Datadog/CloudWatch/Kibana) for these specific emitted markers:
- `Duplicate email job payload detected and prevented` (Normal — indicates idempotency is successfully catching retries/spikes).
- `Job duration exceeded 50% of lock duration` (Warning — indicates actual job execution is dangerously close to the 120s Bull lock. Requires future profiling).

---

## 4. Alert Conditions (Immediate Abort Triggers)

**ABORT AND INITIATE ROLLBACK** if any of the following occur:
1. **Duplicate Side-Effects:** User reports or DB analysis confirms the same user received 2 identical emails simultaneously.
2. **Stalled Job Spikes:** Stalled job counts jump abruptly (indicates the event loop protection in Phase 3 failed, or locking config is misaligned).
3. **Execution Time Anomalies:** Job processing MS metrics spike severely compared to the old baseline.
4. **Cache Evaporation:** Users report entirely missing data or stale views that fail to reflect their latest DB mutations (indicates the new Cache TTL pipeline is malfunctioning).

---

## 5. Rollback Plan (FAST & CLEAR)

If an abort trigger is hit, execute this exact sequence to restore systemic integrity.

#### Step 1: Revert Codebase
Immediately revert the deployment to the last known stable commit tag.
```bash
git checkout v_stable_previous
npm install
```

#### Step 2: Global Restart
Restart all API servers and worker nodes to instantly kill any currently hanging Phase 3 side-effects.
```bash
pm2 restart all
```

#### Step 3: Redis State Purge (CRITICAL)
Because Phase 3 introduced *new* 7-day `SET NX` idempotency locks (`idemp:email:hash`), returning to the old `idemp:email:{job.id}` code while the new locks inhabit Redis could permanently wedge retried jobs. 
Clear the new locks:
```bash
# Safely clear the new payload-based idempotency locks
redis-cli KEYS "idemp:email:*" | xargs -r redis-cli DEL
```

---

## 6. Post-Deployment Validation

Once the system establishes full stability post-rollout:
1. **Trigger a safe, live idempotency payload**: Open two browser tabs to the application, and trigger a "Reset Password" email simultaneously from both. Verify your inbox strictly receives only 1 email.
2. **Verify Cache Invalidation**: Modify your user profile (e.g., change your bio). Force-refresh a separate browser viewing your profile. Ensure the data visually updates instantly, proving tag invalidation still works cleanly.
3. **Confirm Load Optimization**: Validate that Redis CPU utilization and Network Sent/Received bytes have dropped proportionately alongside the `instantaneous_ops_per_sec`.
