const autocannon = require('autocannon');
const http = require('http');

// ── Helper: GET /metrics ───────────────────────────────────────────
function captureMetrics() {
  return new Promise((resolve) => {
    http.get('http://localhost:5000/metrics', (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        // Extract the four key counters from Prometheus text format
        const extract = (name) => {
          const match = body.match(new RegExp(`^${name}\\{.*?\\}\\s+(\\d+)`, 'm'));
          if (match) return parseInt(match[1], 10);
          // Try without labels
          const match2 = body.match(new RegExp(`^${name} (\\d+)`, 'm'));
          return match2 ? parseInt(match2[1], 10) : 0;
        };
        // Sum all label combinations for each counter
        const sumCounter = (name) => {
          let total = 0;
          const re = new RegExp(`^${name}\\{[^}]*\\}\\s+(\\d+)`, 'gm');
          let m;
          while ((m = re.exec(body)) !== null) total += parseInt(m[1], 10);
          return total || extract(name);
        };
        resolve({
          requests_total: sumCounter('requests_total'),
          rate_limit_triggered_total: sumCounter('rate_limit_triggered_total'),
          slowdown_triggered_total: sumCounter('slowdown_triggered_total'),
          redis_limiter_calls_total: sumCounter('redis_limiter_calls_total'),
        });
      });
    }).on('error', () => resolve({ error: 'metrics endpoint unreachable' }));
  });
}

// ── Helper: run autocannon test ────────────────────────────────────
function runTest(label, config) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[LOAD TEST] ${label}`);
    console.log(`${'='.repeat(60)}`);
    const instance = autocannon(config, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    autocannon.track(instance, { renderProgressBar: true });
  });
}

// ── Helper: print summary ──────────────────────────────────────────
function printSummary(label, result, metricsBefore, metricsAfter) {
  const statusCodes = result.statusCodeStats || {};
  console.log(`\n── ${label} Results ──────────────────────────────────────`);
  console.log(`  Total requests   : ${result.requests.total}`);
  console.log(`  Errors           : ${result.errors}`);
  console.log(`  Avg latency      : ${result.latency.mean.toFixed(2)} ms`);
  console.log(`  p50 latency      : ${result.latency.p50} ms`);
  console.log(`  p95 latency      : ${result.latency.p95} ms`);
  console.log(`  Throughput (RPS) : ${result.requests.mean.toFixed(0)} req/s`);
  console.log(`  Status codes     :`);
  Object.entries(statusCodes).forEach(([code, stats]) => {
    console.log(`    HTTP ${code}: ${stats.count}`);
  });
  console.log(`  Metrics delta    :`);
  console.log(`    requests_total              +${metricsAfter.requests_total - metricsBefore.requests_total}`);
  console.log(`    rate_limit_triggered_total  +${metricsAfter.rate_limit_triggered_total - metricsBefore.rate_limit_triggered_total}`);
  console.log(`    slowdown_triggered_total    +${metricsAfter.slowdown_triggered_total - metricsBefore.slowdown_triggered_total}`);
  console.log(`    redis_limiter_calls_total   +${metricsAfter.redis_limiter_calls_total - metricsBefore.redis_limiter_calls_total}`);
}

// ── Main ───────────────────────────────────────────────────────────
(async () => {
  const results = {};

  // ── TEST 1: Vlog Feed (Read) ─────────────────────────────────────
  const m0 = await captureMetrics();
  const r1 = await runTest('Vlog Feed Read (GET /api/vlogs)', {
    url: 'http://localhost:5000/api/vlogs?page=1&limit=12',
    connections: 30,
    duration: 30,
    method: 'GET',
  });
  const m1 = await captureMetrics();
  printSummary('Vlog Feed Read', r1, m0, m1);
  results.vlogFeed = { result: r1, metricsDelta: m1 };

  // Cool-down before next test
  await new Promise(r => setTimeout(r, 5000));

  // ── TEST 2: Auth Session (Identity) ─────────────────────────────
  const m2 = await captureMetrics();
  const r2 = await runTest('Auth Session (GET /api/auth/me)', {
    url: 'http://localhost:5000/api/auth/me',
    connections: 20,
    duration: 30,
    method: 'GET',
  });
  const m3 = await captureMetrics();
  printSummary('Auth Session', r2, m2, m3);
  results.authSession = { result: r2, metricsDelta: m3 };

  // Cool-down before next test
  await new Promise(r => setTimeout(r, 5000));

  // ── TEST 3: Comment Spam (Mutation) ──────────────────────────────
  const m4 = await captureMetrics();
  const r3 = await runTest('Comment Spam (POST /api/vlogs/:id/comments)', {
    url: 'http://localhost:5000/api/vlogs/60d5ecb54d39f7158ca1e915/comments',
    connections: 20,
    duration: 30,
    method: 'POST',
    body: JSON.stringify({ text: 'load test comment' }),
    headers: { 'content-type': 'application/json' },
  });
  const m5 = await captureMetrics();
  printSummary('Comment Spam', r3, m4, m5);
  results.commentSpam = { result: r3, metricsDelta: m5 };

  // ── Final /metrics snapshot ─────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('[FINAL METRICS SNAPSHOT]');
  console.log('='.repeat(60));
  console.log(JSON.stringify(m5, null, 2));

  console.log('\n[Phase 7] Load test run complete.');
})().catch(console.error);
