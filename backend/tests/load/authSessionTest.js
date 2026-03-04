import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1m', // 1000 requests per minute
      duration: '1m',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
};

export default function () {
  // Test hitting the auth session check endpoint
  const res = http.get('http://localhost:5000/api/auth/me');

  check(res, {
    'status is NOT 429': (r) => r.status !== 429,
    'handled gracefully (401/200/etc)': (r) => r.status !== 500 && r.status !== 429,
  });
}
