# Phase 7 Final Deployment Playbook

## Pre-Flight Verification Checklist

Run these checks before touching any production server:

### Code Verification

```bash
# 1. Confirm stalledInterval is 120000 (not 60000)
grep -n "stalledInterval" backend/src/config/queue.config.js
# Expected: stalledInterval: 120000

# 2. Confirm guardInterval is 60000 (not 30000)
grep -n "guardInterval" backend/src/config/queue.config.js
# Expected: guardInterval: 60000

# 3. Confirm lockDuration/lockRenewTime are still consistent (120s / 60s)
grep -n "lockDuration\|lockRenewTime" backend/src/config/queue.config.js
# Expected: lockDuration: 120000, lockRenewTime: 60000

# 4. Confirm DONE idempotency write is present in emailWorker
grep -n "'DONE'" backend/src/workers/emailWorker.js
# Expected: 1 line containing 'DONE', 'XX'

# 5. Confirm no test/debug crash triggers remain
grep -n "CRASH_TEST\|MOCK SIDE-EFFECT\|setTimeout.*process.exit" backend/src
# Expected: zero results
```

All 5 checks must pass before proceeding.

---

## Deployment Steps

### Step 1 — Tag the release

```bash
git add backend/src/config/queue.config.js backend/src/workers/emailWorker.js
git commit -m "chore: Phase 7 — halve Bull polling frequency (stalledInterval 60→120s, guardInterval 30→60s)"
git tag v-phase7-redis-opt
git push origin main --tags
```

### Step 2 — Canary (1 worker only)

Deploy to exactly **one** background worker instance. Keep all other workers running on the previous version.

```bash
# On the canary worker node only:
git pull origin main
npm install --omit=dev
pm2 restart worker-canary --update-env
```

**Wait 30–60 minutes.** Monitor the checklist below before proceeding.

### Step 3 — Full Worker Rollout

Only proceed if canary monitoring shows zero issues.

```bash
pm2 reload worker-fleet
```

> No rolling restarts for API servers are required — this change only affects `queue.config.js` (worker-side settings). The API layer is unaffected.

---

## Monitoring Checklist (Run During Canary Dwell Period)

### Redis — Run every 5 minutes

```bash
# Observe ops/sec trend (should drop vs pre-deploy baseline)
redis-cli INFO STATS | grep instantaneous_ops_per_sec

# Connection count (should remain flat / stable)
redis-cli INFO CLIENTS | grep connected_clients
```

**Expected:** `instantaneous_ops_per_sec` drops noticeably compared to the value you recorded before deploying.

### Bull Queue Health

Look for these in your log aggregation (Datadog / CloudWatch / local `pm2 logs`):

```bash
pm2 logs worker-canary --lines 500 | grep -E "stalled|failed|lock renewal"
```

| Signal | Expected | Fail Condition |
|---|---|---|
| `[QUEUE:email] Job stalled` | Zero | Any spike |
| `Failed to renew lock` | Zero | Any occurrence |
| `Duplicate email job payload` | Occasional (normal retries) | High rate burst |
| `JOB_COMPLETED` | Normal rate | Zero (worker frozen) |

### Redis Idempotency State Spot-Check

```bash
# Verify a completed job key correctly transitions to DONE (not stuck at LOCKED)
redis-cli KEYS "idemp:email:*" | head -5
redis-cli GET <paste_one_key_above>
# Expected: "DONE" for any completed job
```

---

## Rollback Triggers (Abort Immediately)

Initiate rollback if **any** of the following occur during the canary dwell:

1. `[QUEUE:*] Job stalled` logs appear more than **2× the pre-deploy baseline**.
2. Any job log shows `Lock renewal failed`.
3. User reports duplicate emails received within the monitoring window.
4. Redis `instantaneous_ops_per_sec` *rises* instead of falling.
5. Worker stops processing (`JOB_COMPLETED` drops to zero for >2 minutes).

---

## Rollback Steps (Fast — Under 2 Minutes)

```bash
# 1. Revert config live using previous tag
git checkout v-prev-stable -- backend/src/config/queue.config.js

# 2. Restart the canary worker immediately
pm2 restart worker-canary --update-env

# 3. If full fleet was already rolled out
pm2 reload worker-fleet
```

Redis state requires **no cleanup** — the idempotency keys, queue state, and Bull metadata are unaffected by the `stalledInterval`/`guardInterval` change. Jobs will resume normal processing within seconds.

---

## Post-Deployment Validation (After Full Fleet Rollout)

```bash
# 1. Final Redis ops/sec snapshot
redis-cli INFO STATS | grep instantaneous_ops_per_sec
# Compare against the pre-deploy baseline. Expect ~30–40% drop in idle ops.

# 2. Queue health summary
redis-cli LLEN bull:email:wait
redis-cli LLEN bull:email:active
redis-cli ZCARD bull:email:delayed
# All should be near-zero if no jobs are queued.

# 3. Confirm stall detection still works at the new interval
# (This is a thought experiment only — do not force a crash in production)
# If stall count remains 0 after 3+ hours of traffic, the relaxed interval is working.
```

---

## Summary

| Parameter | Before | After (Phase 7) |
|---|---|---|
| `stalledInterval` | 60s | 120s |
| `guardInterval` | 30s | 60s |
| `lockDuration` | 120s | 120s (unchanged) |
| `lockRenewTime` | 60s | 60s (unchanged) |
| Idempotency `DONE` write | ✅ Present | ✅ Present (never removed) |
| Estimated savings | — | ~1.75M cmds/month |
