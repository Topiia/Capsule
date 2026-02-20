/* eslint-disable */
import http from 'k6/http';
import { check, sleep } from 'k6';

// 1. Configuration
export const options = {
  // Key concept: Ramp up load gradually to find the breaking point
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users over 30s
    { duration: '1m', target: 20 },   // Stay at 20 users for 1 minute
    { duration: '30s', target: 50 },  // Spike to 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be < 500ms
    http_req_failed: ['rate<0.01'],   // Error rate should be < 1%
  },
};

// 2. The Test Function (simulating a user)
export default function () {
  // Note: Using localhost for local execution
  const res = http.get('http://localhost:5000/health');

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  sleep(1); // Think time (1 second between requests)
}
