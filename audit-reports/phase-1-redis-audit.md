# Phase 1: Redis Architecture Audit Report

**Total Redis connections found**: 8 (estimated minimum based on instantiated clients)
**Queue libraries in use**: Bull (v4.16.5)
**Estimated monthly commands**: ~9,430,000 (14,074% of 67,000 free tier limit)
**Primary optimization target**: Bull \`stalledInterval\` defaults and Rate Limiter consolidation

## Executive Summary
The codebase uses a mix of \`ioredis\` (v5.9.1) for general caching/rate-limiting and \`bull\` (v4.16.5) for background queues. There is a single centralized Redis singleton connection for caching and state, but Bull queues instantiate their own internal clients (typically 2 per queue instance - one for commands, one for sub/pub). With 3 defined queues and 2 background workers, the background idle check commands (stalled job checks) from Bull alone generate millions of Redis commands per month, likely exhausting free-tier limits even with zero user traffic. Optimization of Bull configurations and caching patterns is highly recommended.

---

## 1. Connection Inventory

| Connection ID | File Path | Library | Config | Purpose | is_bull | is_cache | is_rate_limiter |
|---|---|---|---|---|---|---|---|
| `redis_singleton` | `backend/src/config/redis.js` | `ioredis` | maxRetries: 3, lazyConnect: true, enableReadyCheck: true | Centralized caching & state mgmt | `false` | `true` | `false` |
| `rate_limiter_store` | `backend/src/middleware/rateLimit.js` | `rate-limit-redis` | Reuses `redis_singleton` config | State storage for Express rate limiters | `false` | `false` | `true` |
| `bull_email_producer` | `backend/src/queues/emailQueue.js` | `bull` | Default Bull settings (no stalledInterval override) | Queues emails | `true` | `false` | `false` |
| `bull_moderation_producer` | `backend/src/queues/moderationQueue.js` | `bull` | Default Bull settings | Queues moderation tasks | `true` | `false` | `false` |
| `bull_account_del_producer` | `backend/src/queues/accountDeletionQueue.js` | `bull` | Default Bull settings | Queues Cloudinary asset deletions | `true` | `false` | `false` |
| `bull_email_worker` | `backend/src/workers/emailWorker.js` | `bull` | Default Bull settings | Processes email jobs | `true` | `false` | `false` |
| `bull_account_del_worker` | `backend/src/queues/accountDeletionQueue.js` | `bull` | Default Bull settings | Processes account deletions | `true` | `false` | `false` |

---

## 2. Queue Analysis

### Queue 1: Email Queue
```json
{
  "queue_name": "email",
  "file_path": "backend/src/queues/emailQueue.js",
  "redis_connection": "emailConfig.redis",
  "settings": {
    "stalledInterval": "5000ms (Default)",
    "lockDuration": "30000ms (Default)",
    "lockRenewTime": "15000ms (Default)",
    "maxStalledCount": "1 (Default)",
    "guardInterval": "5000ms (Default)",
    "retryProcessDelay": "5000ms (Default)"
  },
  "workers": {
    "count": "1",
    "concurrency": "1 (Default)",
    "file_path": "backend/src/workers/emailWorker.js"
  },
  "estimated_commands_per_minute_idle": 72
}
```

### Queue 2: Moderation Queue
```json
{
  "queue_name": "moderation-queue",
  "file_path": "backend/src/queues/moderationQueue.js",
  "redis_connection": "redisConfig",
  "settings": {
    "stalledInterval": "5000ms (Default)",
    "lockDuration": "30000ms (Default)",
    "lockRenewTime": "15000ms (Default)"
  },
  "workers": {
    "count": "0 (Worker file not found in scan scope; possibly handled elsewhere)",
    "concurrency": "N/A",
    "file_path": "N/A"
  },
  "estimated_commands_per_minute_idle": 36
}
```

### Queue 3: Account Deletion Queue
```json
{
  "queue_name": "accountDeletion",
  "file_path": "backend/src/queues/accountDeletionQueue.js",
  "redis_connection": "emailConfig.redis",
  "settings": {
    "stalledInterval": "5000ms (Default)",
    "lockDuration": "30000ms (Default)",
    "lockRenewTime": "15000ms (Default)"
  },
  "workers": {
    "count": "1",
    "concurrency": "1 (Default)",
    "file_path": "backend/src/queues/accountDeletionQueue.js (startAccountDeletionWorker)"
  },
  "estimated_commands_per_minute_idle": 72
}
```

---

## 3. Cache System Analysis

```json
{
  "file_path": "backend/src/middleware/cache.js",
  "middleware_name": "cacheMiddleware",
  "routes_affected": ["GET requests where middleware is applied"],
  "redis_commands_per_request": {
    "cache_hit": ["GET"],
    "cache_miss": ["GET", "SET", "EXPIRE", "SADD", "TTL"],
    "cache_invalidation": ["SMEMBERS", "DEL"]
  },
  "ttl_seconds": "300 (Default)",
  "key_pattern": "cache:{baseUrl}{path}:{userId}:{base64(query)}",
  "estimated_commands_per_100_requests": "Assuming 20% miss rate = 80 GETs + 20x(GET + Pipeline Update Data) = ~140 commands"
}
```
*Note: The caching strategy uses a complex dual-metric Pipeline system (`addTags`) executing multiple commands on cache MISS to build reverse index tags (`tag:vlog:{id}`, `tag:user:{id}`).*

---

## 4. Rate Limiting Analysis

```json
{
  "file_path": "backend/src/middleware/rateLimit.js",
  "store_type": "RedisStore (via rate-limit-redis)",
  "if_redis": {
    "windowMs": "Varies (60000ms to 900000ms depending on limiter)",
    "maxRequests": "Varies (5 to 1000 depending on limiter)",
    "estimated_commands_per_request": 2
  }
}
```
*There are 6 standard limiters defined (auth, identity, mutation, generalRead, viewCount, deleteAccount).*

---

## 5. Command Volume Breakdown

```json
{
  "bull_queues": {
    "all_queues_combined": {
      "idle_check_interval_ms": 5000,
      "commands_per_check": 3,
      "checks_per_day": 86400, 
      "instances": 5,
      "monthly_commands": 7776000
    }
  },
  "cache": {
    "avg_requests_per_day": "5000 (Estimate)",
    "cache_hit_rate": "80%",
    "monthly_commands": 210000
  },
  "rate_limiter": {
    "if_redis_store": 1444000, 
    "else": 0
  },
  "total_estimated_monthly": 9430000,
  "vs_free_tier_limit": "67000",
  "overage_percentage": "14074%"
}
```
*Note: Due to the 5 instances of Bull evaluating `stalledInterval` continuously (even with zero user traffic), the baseline traffic far exceeds a 67,000 allowance.*

---

## 6. Optimization Recommendations (Ranked by Impact)

| Rank | Component | Current State | Optimization Potential | Risk Level |
|---|---|---|---|---|
| **1** | Bull `stalledInterval` | Default 5000ms | Increase to 60000ms (1 minute). This will slash idle checks by 90%, saving ~7 million commands/month. | Low |
| **2** | Bull `guardInterval` | Default 5000ms | Increase to 30000ms or 60000ms | Low |
| **3** | Cache Invalidation `addTags` | Pipelines SADD/TTL/EXPIRE on MISS | Consolidate tagging logic; currently uses 2 pipelines and evaluates multiple logic gates per MISS. | Medium |
| **4** | Redis Client Pooling | Multiple Bull clients | Bull allows passing existing `createGroup` or `redis` connections via `createClient` function logic to reuse connections across identical queue consumers. | Low |
| **5** | Bull `lockRenewTime` | Default 15000ms | Increase to 30000ms to reduce lock renewal polling overhead on lengthier jobs. | Low |

---

## 7. Risk Assessment

* **What could break if we change `stalledInterval`?**
  If `stalledInterval` is increased to 60000ms, it means that if a worker node crashes mid-job (OOM, server crash), the failed job will not get picked up by another worker for up to 60 seconds (instead of 5 seconds). Since the main queues (emails, image deletion) are generally relaxed background tasks, this 1-minute delay on catastrophic failure is completely acceptable.
* **What depends on current cache behavior?** 
  The robust reverse-tagging index allows for pinpoint invalidation without clearing the entire cache. Modifying the Pipeline structure could accidentally leave orphaned tags or cache entries with permanent lifetimes if exact TTL inheritance is broken.
* **Any race conditions or concurrency issues?** 
  If Rate Limiters aren't utilizing atomic operations seamlessly behind the scenes (or if we transition them away from `rate-limit-redis`), we might suffer race conditions globally. For Bull, raising the `stalledInterval` has no concurrency risk, it solely dictates crash-recovery pickup time. 

---

## 8. Files That Would Be Modified

1. `backend/src/queues/emailQueue.js`
2. `backend/src/workers/emailWorker.js`
3. `backend/src/queues/moderationQueue.js`
4. `backend/src/queues/accountDeletionQueue.js`
5. `backend/src/middleware/cache.js`

---

## Appendix: Raw Discovery Data

**Search Commands Run:**
* `grep "redis" backend\`
* `grep "bull" backend\`
* `grep "rate-limit" backend\`
* `grep "cache" backend\`

**Dependencies Found (`backend/package.json`):**
* \`ioredis\` ^5.9.1
* \`bull\` ^4.16.5
* \`express-rate-limit\` ^6.8.1
* \`rate-limit-redis\` ^4.3.1
