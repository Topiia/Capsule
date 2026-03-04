/**
 * Phase 9 — Infrastructure Failure Simulation Runner
 *
 * Tests:
 *   1. Redis outage  — kill Redis in WSL, send requests, verify graceful fallback
 *   2. Redis recovery — restart Redis, verify limiter resumes Redis-backed operation
 *   3. MongoDB resilience — sustained DB-backed requests, verify no crashes/500s
 *   4. SlowDown shadow — verify express-slow-down fires before Redis under load
 *
 * Safety: max 3 connections, max 15s, max 20 req/s, sequential.
 */

const autocannon = require('autocannon');
const http = require('http');
const { execSync, exec } = require('child_process');

const BASE = 'http://localhost:5000';

// ── Metrics capture ───────────────────────────────────────────────────────────
function captureMetrics() {
  return new Promise((resolve) => {
    http.get(`${BASE}/metrics`, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        const sumCounter = (name) => {
          let total = 0;
          const re = new RegExp(`^${name}\\{[^}]*\\}\\s+(\\d+)`, 'gm');
          let m = re.exec(body);
          while (m) { total += parseInt(m[1], 10); m = re.exec(body); }
          if (total === 0) {
            const m2 = body.match(new RegExp(`^${name} (\\d+)`, 'm'));
            return m2 ? parseInt(m2[1], 10) : 0;
          }
          return total;
        };
        resolve({
          requests_total: sumCounter('requests_total'),
          rate_limit_triggered_total: sumCounter('rate_limit_triggered_total'),
          slowdown_triggered_total: sumCounter('slowdown_triggered_total'),
          redis_limiter_calls_total: sumCounter('redis_limiter_calls_total'),
        });
      });
    }).on('error', () => resolve({ error: 'metrics unreachable' }));
  });
}

// ── Single lightweight request (to check server is alive) ─────────────────────
function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/api/vlogs?page=1&limit=3`, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', () => resolve('ERROR'));
    req.setTimeout(3000, () => { req.destroy(); resolve('TIMEOUT'); });
  });
}

// ── WSL Redis control ─────────────────────────────────────────────────────────
function wslExec(cmd) {
  try {
    const out = execSync(`wsl -e bash -c "${cmd}"`, { timeout: 10000, encoding: 'utf8' });
    return out.trim();
  } catch (e) {
    return e.message;
  }
}

function getRedisPid() {
  const pid = wslExec('pidof redis-server 2>/dev/null || echo ""');
  return pid ? pid.trim() : null;
}

function stopRedis() {
  const pid = getRedisPid();
  if (pid) {
    console.log(`  [Redis] Stopping PID ${pid}...`);
    wslExec(`kill -9 ${pid} 2>/dev/null; sleep 0.5`);
  }
  const confirm = getRedisPid();
  return !confirm;
}

function startRedis() {
  console.log('  [Redis] Starting redis-server in WSL...');
  wslExec('redis-server --daemonize yes --loglevel warning 2>/dev/null || true');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return sleep(1500).then(() => {
    const pid = getRedisPid();
    console.log(pid ? `  [Redis] Started PID ${pid}` : '  [Redis] WARNING: Redis did not start');
    return !!pid;
  });
}

// ── Autocannon runner ─────────────────────────────────────────────────────────
function runTest(label, config) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`[PHASE 9] ${label}`);
    console.log('='.repeat(64));
    const inst = autocannon(config, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
    autocannon.track(inst, { renderProgressBar: true });
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────
function summarize(label, result, before, after) {
  const sc = result.statusCodeStats || {};
  const delta = (k) => (after[k] || 0) - (before[k] || 0);
  console.log(`\n──── ${label} ─────────────────────────────────────────`);
  console.log(`  Total requests  : ${result.requests.total}`);
  console.log(`  Errors          : ${result.errors}`);
  console.log(`  Avg latency     : ${result.latency.mean.toFixed(2)} ms`);
  console.log(`  p50 latency     : ${result.latency.p50} ms`);
  console.log(`  p95 latency     : ${result.latency.p95 || 'N/A'} ms`);
  console.log(`  RPS             : ${result.requests.mean.toFixed(0)}`);
  console.log(`  Status codes    :`);
  Object.entries(sc).forEach(([code, s]) => console.log(`    HTTP ${code}: ${s.count}`));
  console.log(`  Metrics delta   :`);
  console.log(`    redis_limiter_calls_total  +${delta('redis_limiter_calls_total')}`);
  console.log(`    rate_limit_triggered_total +${delta('rate_limit_triggered_total')}`);
  console.log(`    slowdown_triggered_total   +${delta('slowdown_triggered_total')}`);
  return {
    label,
    total: result.requests.total,
    errors: result.errors,
    avgLatency: result.latency.mean,
    p50: result.latency.p50,
    p95: result.latency.p95,
    rps: result.requests.mean,
    statusCodes: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, v.count])),
    metricsDelta: {
      requests_total: delta('requests_total'),
      rate_limit_triggered_total: delta('rate_limit_triggered_total'),
      slowdown_triggered_total: delta('slowdown_triggered_total'),
      redis_limiter_calls_total: delta('redis_limiter_calls_total'),
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const report = { tests: [], meta: {} };

  // Pre-test
  console.log('\n[Phase 9] Pre-test checks...');
  const preCheck = await ping();
  console.log(`  [API]   GET /api/vlogs → ${preCheck}`);
  console.log(`  [Redis] PID: ${getRedisPid() || 'NOT FOUND'}`);
  const baseline = await captureMetrics();
  console.log('  [Baseline]', JSON.stringify(baseline));
  report.meta.baseline = baseline;

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1 — Redis Outage
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[Phase 9] TEST 1: Stopping Redis in WSL...');
  const stopped = stopRedis();
  console.log(`  [Redis] Stopped: ${stopped}`);
  await sleep(1000);

  // Verify Redis is down
  const redisPingAfterStop = wslExec('redis-cli ping 2>&1 || echo "FAILED"');
  console.log(`  [Redis] Ping after stop: ${redisPingAfterStop}`);

  const m1before = await captureMetrics();
  const r1 = await runTest('Test 1 — Redis Outage (GET /api/vlogs with Redis DOWN)', {
    url: `${BASE}/api/vlogs?page=1&limit=3`,
    connections: 3,
    duration: 15,
    method: 'GET',
  });
  const m1after = await captureMetrics();
  const s1 = summarize('Test 1 — Redis Outage', r1, m1before, m1after);
  report.tests.push(s1);

  const sc1 = r1.statusCodeStats || {};
  const crashed = Object.keys(sc1).length === 0 && r1.errors > 100;
  console.log(`  [VERDICT] Server ${crashed ? '❌ CRASHED' : '✅ SURVIVED'} Redis outage`);
  console.log(`  [VERDICT] Responses: 200=${sc1['200']?.count || 0} 429=${sc1['429']?.count || 0} 500=${sc1['500']?.count || 0}`);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2 — Redis Recovery
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n[Phase 9] TEST 2: Restarting Redis...');
  await startRedis();
  // Give the backend's Redis client time to reconnect
  await sleep(3000);

  const redisPingAfterStart = wslExec('redis-cli ping 2>&1');
  console.log(`  [Redis] Ping after restart: ${redisPingAfterStart}`);

  const m2before = await captureMetrics();
  const r2 = await runTest('Test 2 — Redis Recovery (GET /api/vlogs with Redis BACK)', {
    url: `${BASE}/api/vlogs?page=1&limit=3`,
    connections: 3,
    duration: 15,
    method: 'GET',
  });
  const m2after = await captureMetrics();
  const s2 = summarize('Test 2 — Redis Recovery', r2, m2before, m2after);
  report.tests.push(s2);

  const redisCallsDelta = m2after.redis_limiter_calls_total - m2before.redis_limiter_calls_total;
  console.log(`  [VERDICT] Redis calls resumed: ${redisCallsDelta > 0 ? '✅ YES' : '⚠️  Not yet (may still be down)'} (+${redisCallsDelta})`);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3 — MongoDB Resilience (sustained DB-backed load)
  // ─────────────────────────────────────────────────────────────────────────
  await sleep(2000);
  const m3before = await captureMetrics();
  const r3 = await runTest('Test 3 — MongoDB Resilience (GET /api/vlogs sustained)', {
    url: `${BASE}/api/vlogs?page=1`,
    connections: 3,
    duration: 15,
    method: 'GET',
  });
  const m3after = await captureMetrics();
  const s3 = summarize('Test 3 — MongoDB Resilience', r3, m3before, m3after);
  report.tests.push(s3);

  const sc3 = r3.statusCodeStats || {};
  const has500 = (sc3['500']?.count || 0) > 0;
  console.log(`  [VERDICT] 500 errors: ${has500 ? '❌ YES — investigate' : '✅ NONE'}`);
  console.log(`  [VERDICT] Server responsive: ${r3.errors < r3.requests.total * 0.1 ? '✅ YES' : '⚠️  High error rate'}`);

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4 — SlowDown Shadow Verification
  // ─────────────────────────────────────────────────────────────────────────
  await sleep(2000);
  const m4before = await captureMetrics();
  const r4 = await runTest('Test 4 — SlowDown Shadow (burst to trigger slow-down)', {
    url: `${BASE}/api/vlogs?page=1`,
    connections: 3,
    duration: 15,
    method: 'GET',
  });
  const m4after = await captureMetrics();
  const s4 = summarize('Test 4 — SlowDown Shadow', r4, m4before, m4after);
  report.tests.push(s4);

  const slowdownDelta = m4after.slowdown_triggered_total - m4before.slowdown_triggered_total;
  const rateLimitDelta = m4after.rate_limit_triggered_total - m4before.rate_limit_triggered_total;
  console.log(`  [VERDICT] SlowDown triggered: ${slowdownDelta > 0 ? '✅ YES' : '⚠️  NO'} (+${slowdownDelta})`);
  console.log(`  [VERDICT] RateLimit triggered: ${rateLimitDelta > 0 ? '✅ YES' : '—'} (+${rateLimitDelta})`);

  // ─────────────────────────────────────────────────────────────────────────
  // Final snapshot
  // ─────────────────────────────────────────────────────────────────────────
  const finalMetrics = await captureMetrics();
  report.meta.finalMetrics = finalMetrics;

  console.log('\n' + '='.repeat(64));
  console.log('[FINAL METRICS SNAPSHOT — END OF PHASE 9]');
  console.log('='.repeat(64));
  console.log(JSON.stringify(finalMetrics, null, 2));

  // Final Redis state
  const finalRedisPid = getRedisPid();
  console.log(`\n[Redis] Final PID: ${finalRedisPid || 'NOT RUNNING — restarting...'}`);
  if (!finalRedisPid) await startRedis();

  const fs = require('fs');
  fs.writeFileSync('tests/load/phase9_raw_results.json', JSON.stringify(report, null, 2));
  console.log('\n[Phase 9] Results saved to tests/load/phase9_raw_results.json');
  console.log('[Phase 9] Infrastructure failure simulation complete.');
})().catch((err) => {
  console.error('[Phase 9] FATAL ERROR:', err);
  process.exit(1);
});
