/**
 * Phase 8 — Abuse Simulation Runner
 * 
 * Simulates 4 realistic attacker patterns against the live dev server:
 *   1. IP Rotation (X-Forwarded-For cycling)
 *   2. Burst Traffic (burst → pause → burst)
 *   3. Auth Token Replay (same token across many connections)
 *   4. Mutation Spam (comment POST flood)
 *
 * Constraints: max 10 VUs, max 20s, max 50 req/s, sequential tests only.
 */

const autocannon = require('autocannon');
const http = require('http');

// Rotating fake IPs for Test 1
const FAKE_IPS = [
  '10.0.0.1', '10.0.0.2', '10.0.0.3', '10.0.0.4', '10.0.0.5',
  '192.168.1.10', '192.168.1.11', '172.16.0.1', '172.16.0.2', '34.55.66.77',
];

// -- Metrics capture -----------------------------------------------------------
function captureMetrics() {
  return new Promise((resolve) => {
    http.get('http://localhost:5000/metrics', (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        const sumCounter = (name) => {
          let total = 0;
          const re = new RegExp(`^${name}\\{[^}]*\\}\\s+(\\d+)`, 'gm');
          let m;
          while ((m = re.exec(body)) !== null) total += parseInt(m[1], 10);
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

// -- Autocannon wrapper --------------------------------------------------------
function runTest(label, config) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`[ABUSE TEST] ${label}`);
    console.log('='.repeat(64));
    const inst = autocannon(config, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
    autocannon.track(inst, { renderProgressBar: true });
  });
}

// -- Print per-test summary ----------------------------------------------------
function printSummary(label, result, before, after) {
  const sc = result.statusCodeStats || {};
  const delta = (k) => (after[k] || 0) - (before[k] || 0);
  console.log(`\n──── ${label} Summary ────────────────────────────────────`);
  console.log(`  Total requests : ${result.requests.total}`);
  console.log(`  Errors         : ${result.errors}`);
  console.log(`  Avg latency    : ${result.latency.mean.toFixed(2)} ms`);
  console.log(`  p50 latency    : ${result.latency.p50} ms`);
  console.log(`  p95 latency    : ${result.latency.p95 || 'N/A'} ms`);
  console.log(`  RPS            : ${result.requests.mean.toFixed(0)}`);
  console.log(`  Status codes   :`);
  Object.entries(sc).forEach(([code, s]) => console.log(`    HTTP ${code}: ${s.count}`));
  console.log(`  Metrics delta  :`);
  console.log(`    requests_total             +${delta('requests_total')}`);
  console.log(`    rate_limit_triggered_total +${delta('rate_limit_triggered_total')}`);
  console.log(`    slowdown_triggered_total   +${delta('slowdown_triggered_total')}`);
  console.log(`    redis_limiter_calls_total  +${delta('redis_limiter_calls_total')}`);

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

// -- Main execution -----------------------------------------------------------
(async () => {
  const report = [];
  console.log('\n[Phase 8] Capturing baseline metrics...');
  const baseline = await captureMetrics();
  console.log('Baseline:', JSON.stringify(baseline));

  // ── TEST 1: IP Rotation ──────────────────────────────────────────
  const m0 = await captureMetrics();
  const r1 = await runTest('Test 1 — IP Rotation (X-Forwarded-For cycling)', {
    url: 'http://localhost:5000',
    connections: 5,
    duration: 20,
    method: 'GET',
    requests: FAKE_IPS.map((ip) => ({
      method: 'GET',
      path: '/api/vlogs?page=1&limit=12',
      headers: { 'x-forwarded-for': ip },
    })),
  });
  const m1 = await captureMetrics();
  report.push(printSummary('IP Rotation', r1, m0, m1));
  await sleep(3000);

  // ── TEST 2: Burst Traffic ────────────────────────────────────────
  const m2 = await captureMetrics();
  // Burst 1: 10 connections, 8s
  console.log('\n[Phase 8] Burst 1 of 2...');
  const burst1 = await runTest('Test 2 — Burst Traffic [Burst #1]', {
    url: 'http://localhost:5000/api/vlogs?page=1',
    connections: 10,
    duration: 8,
    method: 'GET',
  });
  // Pause 4s (simulating bot pause)
  console.log('[Phase 8] Bot pause (4s)...');
  await sleep(4000);
  // Burst 2: 10 connections, 8s
  console.log('[Phase 8] Burst 2 of 2...');
  const burst2 = await runTest('Test 2 — Burst Traffic [Burst #2]', {
    url: 'http://localhost:5000/api/vlogs?page=1',
    connections: 10,
    duration: 8,
    method: 'GET',
  });
  const m3 = await captureMetrics();
  // Merge burst results for reporting
  const burstMerged = {
    requests: { total: burst1.requests.total + burst2.requests.total, mean: (burst1.requests.mean + burst2.requests.mean) / 2 },
    errors: burst1.errors + burst2.errors,
    latency: {
      mean: (burst1.latency.mean + burst2.latency.mean) / 2,
      p50: Math.max(burst1.latency.p50, burst2.latency.p50),
      p95: Math.max(burst1.latency.p95 || 0, burst2.latency.p95 || 0),
    },
    statusCodeStats: {
      ...(burst1.statusCodeStats || {}),
      ...(burst2.statusCodeStats || {}),
    },
  };
  // Merge status codes properly
  ['200', '429', '401', '403', '500'].forEach((code) => {
    const a = (burst1.statusCodeStats?.[code]?.count || 0);
    const b = (burst2.statusCodeStats?.[code]?.count || 0);
    if (a + b > 0) burstMerged.statusCodeStats[code] = { count: a + b };
  });
  report.push(printSummary('Burst Traffic (both bursts)', burstMerged, m2, m3));
  await sleep(3000);

  // ── TEST 3: Auth Token Replay ────────────────────────────────────
  // GET /api/auth/me without a cookie → tests identityLimiter ceiling
  // (401s expected — no 429s expected)
  const m4 = await captureMetrics();
  const r3 = await runTest('Test 3 — Auth Token Replay (GET /api/auth/me)', {
    url: 'http://localhost:5000/api/auth/me',
    connections: 5,
    duration: 20,
    method: 'GET',
    headers: {
      // Simulate a replayed credential header
      authorization: 'Bearer fake.token.replay.test',
    },
  });
  const m5 = await captureMetrics();
  report.push(printSummary('Auth Token Replay', r3, m4, m5));
  await sleep(3000);

  // ── TEST 4: Mutation Abuse (Comment Spam) ──────────────────────
  const m6 = await captureMetrics();
  const r4 = await runTest('Test 4 — Mutation Abuse (POST comments)', {
    url: 'http://localhost:5000/api/vlogs/60d5ecb54d39f7158ca1e915/comments',
    connections: 5,
    duration: 20,
    method: 'POST',
    body: JSON.stringify({ text: 'abuse test comment' }),
    headers: { 'content-type': 'application/json' },
  });
  const m7 = await captureMetrics();
  report.push(printSummary('Mutation Abuse', r4, m6, m7));

  // ── Final Snapshot ──────────────────────────────────────────────
  const finalMetrics = await captureMetrics();
  console.log('\n' + '='.repeat(64));
  console.log('[FINAL METRICS SNAPSHOT — END OF PHASE 8]');
  console.log('='.repeat(64));
  console.log(JSON.stringify(finalMetrics, null, 2));

  // ── Raw JSON for report generation ─────────────────────────────
  const fullReport = { baseline, finalMetrics, tests: report };
  require('fs').writeFileSync('tests/load/phase8_raw_results.json', JSON.stringify(fullReport, null, 2));
  console.log('\n[Phase 8] Results saved to tests/load/phase8_raw_results.json');
  console.log('[Phase 8] Abuse simulation complete.');
})().catch(console.error);
