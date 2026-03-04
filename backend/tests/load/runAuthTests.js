/**
 * Phase 8.5 — Authenticated Limiter Verification Runner
 *
 * Steps:
 *   1. Register (or detect existing) a load-test user
 *   2. Login → extract real session cookie / JWT
 *   3. Test 1 — GET /api/auth/me (identityLimiter verification)
 *   4. Test 2 — POST /api/vlogs/:id/comments (mutationLimiter verification)
 *   5. Capture metrics after each test
 *   6. Write structured JSON results to disk
 *
 * Safety: max 5 VUs, max 20s per test, sequential only.
 */

const autocannon = require('autocannon');
const http = require('http');
const https = require('https');

const BASE = 'http://localhost:5000';
const LOAD_TEST_EMAIL = 'loadtest.phase8@gmail.com';
const LOAD_TEST_PASSWORD = 'LoadTest123!';
const LOAD_TEST_USERNAME = 'loadtestphase8';

// ── HTTP helpers (no axios dependency) ────────────────────────────────────────
function httpRequest(method, path, body, cookieHeader) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        referer: 'http://localhost:3000/',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: (() => { try { return JSON.parse(data); } catch { return data; } })(),
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Metrics capture ────────────────────────────────────────────────────────────
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

// ── Autocannon wrapper ─────────────────────────────────────────────────────────
function runTest(label, config) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(64)}`);
    console.log(`[PHASE 8.5] ${label}`);
    console.log('='.repeat(64));
    const inst = autocannon(config, (err, res) => {
      if (err) return reject(err);
      resolve(res);
    });
    autocannon.track(inst, { renderProgressBar: true });
  });
}

// ── Summary printer ───────────────────────────────────────────────────────────
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

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  // Step 1 — ensure load-test user exists
  console.log('\n[Phase 8.5] Registering load-test user...');
  const reg = await httpRequest('POST', '/api/auth/register', {
    username: LOAD_TEST_USERNAME,
    email: LOAD_TEST_EMAIL,
    password: LOAD_TEST_PASSWORD,
  });
  if (reg.status === 201) {
    console.log('  [OK] User registered.');
  } else if (reg.status === 400 && JSON.stringify(reg.body).includes('exists')) {
    console.log('  [OK] User already exists, continuing.');
  } else {
    console.log(`  [INFO] Register returned ${reg.status}:`, JSON.stringify(reg.body).slice(0, 200));
  }

  // Step 2 — login to get session cookie
  console.log('[Phase 8.5] Logging in...');
  const login = await httpRequest('POST', '/api/auth/login', {
    email: LOAD_TEST_EMAIL,
    password: LOAD_TEST_PASSWORD,
  });

  if (login.status !== 200) {
    console.error(`[FATAL] Login failed with ${login.status}:`, JSON.stringify(login.body).slice(0, 300));
    process.exit(1);
  }

  // Extract Set-Cookie header for session
  const rawCookie = login.headers['set-cookie'];
  const cookieHeader = Array.isArray(rawCookie)
    ? rawCookie.map((c) => c.split(';')[0]).join('; ')
    : (rawCookie || '').split(';')[0];

  if (!cookieHeader) {
    console.error('[FATAL] No session cookie returned from login.');
    process.exit(1);
  }

  console.log(`  [OK] Session cookie obtained: ${cookieHeader.slice(0, 80)}...`);

  // Verify GET /api/auth/me works with cookie
  const meCheck = await httpRequest('GET', '/api/auth/me', null, cookieHeader);
  if (meCheck.status !== 200) {
    console.error(`[WARN] GET /api/auth/me returned ${meCheck.status} — cookie may be wrong.`);
  } else {
    console.log(`  [OK] GET /api/auth/me → ${meCheck.status} (user: ${meCheck.body?.data?.username || '?'})`);
  }

  // Get a real vlog ID from the database
  console.log('[Phase 8.5] Fetching a real vlog ID for comment test...');
  const vlogsRes = await httpRequest('GET', '/api/vlogs?page=1&limit=1', null, cookieHeader);
  let vlogId = '60d5ecb54d39f7158ca1e915'; // fallback placeholder
  if (vlogsRes.status === 200 && vlogsRes.body?.data?.vlogs?.length > 0) {
    vlogId = vlogsRes.body.data.vlogs[0]._id;
    console.log(`  [OK] Using real vlog ID: ${vlogId}`);
  } else {
    console.log(`  [WARN] Could not fetch vlog, using placeholder ID: ${vlogId}`);
  }

  // Baseline metrics
  console.log('\n[Phase 8.5] Capturing baseline metrics...');
  const baseline = await captureMetrics();
  console.log('Baseline:', JSON.stringify(baseline));

  const report = [];

  // ── TEST 1: Authenticated Identity Limiter ─────────────────────────────────
  const m0 = await captureMetrics();
  const r1 = await runTest('Test 1 — Authenticated Identity Limiter (GET /api/auth/me)', {
    url: BASE,
    connections: 5,
    duration: 20,
    requests: [
      {
        method: 'GET',
        path: '/api/auth/me',
        headers: { cookie: cookieHeader },
      },
    ],
  });
  const m1 = await captureMetrics();
  report.push(summarize('Test 1 — Authenticated Identity Limiter', r1, m0, m1));

  // Validate: must have 200 responses and NO 401s
  const sc1 = r1.statusCodeStats || {};
  const has401 = sc1['401']?.count > 0;
  const has200 = sc1['200']?.count > 0;
  const has429 = sc1['429']?.count > 0;
  console.log(`  [VALIDATOR] 200s: ${sc1['200']?.count || 0}, 429s: ${sc1['429']?.count || 0}, 401s: ${sc1['401']?.count || 0}`);
  console.log(`  [VALIDATOR] identityLimiter: ${has200 ? '✅ served traffic' : '⚠️ no 200s'}${has429 ? ' → ✅ 429 when limit hit' : ''}${has401 ? ' → ❌ UNEXPECTED 401s (session issue)' : ' → ✅ no 401s'}`);

  await sleep(3000);

  // ── TEST 2: Authenticated Mutation Spam ────────────────────────────────────
  const m2 = await captureMetrics();
  const r2 = await runTest('Test 2 — Authenticated Mutation Spam (POST comments)', {
    url: BASE,
    connections: 5,
    duration: 20,
    requests: [
      {
        method: 'POST',
        path: `/api/vlogs/${vlogId}/comments`,
        headers: {
          cookie: cookieHeader,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Phase 8.5 load test comment' }),
      },
    ],
  });
  const m3 = await captureMetrics();
  report.push(summarize('Test 2 — Authenticated Mutation Spam', r2, m2, m3));

  const sc2 = r2.statusCodeStats || {};
  console.log(`  [VALIDATOR] 201s: ${sc2['201']?.count || 0}, 200s: ${sc2['200']?.count || 0}, 429s: ${sc2['429']?.count || 0}, 400s: ${sc2['400']?.count || 0}`);

  // ── Final Snapshot ─────────────────────────────────────────────────────────
  const finalMetrics = await captureMetrics();
  console.log('\n' + '='.repeat(64));
  console.log('[FINAL METRICS SNAPSHOT — END OF PHASE 8.5]');
  console.log('='.repeat(64));
  console.log(JSON.stringify(finalMetrics, null, 2));

  // Save raw results
  const fs = require('fs');
  fs.writeFileSync(
    'tests/load/phase8_5_raw_results.json',
    JSON.stringify({ baseline, finalMetrics, tests: report }, null, 2),
  );
  console.log('\n[Phase 8.5] Results saved to tests/load/phase8_5_raw_results.json');
  console.log('[Phase 8.5] Authenticated limiter verification complete.');
})().catch((err) => {
  console.error('[Phase 8.5] FATAL ERROR:', err);
  process.exit(1);
});
