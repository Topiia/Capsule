import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
};

export default function () {
  const res = http.get('http://localhost:5000/api/vlogs?page=1&limit=12');

  check(res, {
    'is status 200 (normal)': (r) => r.status === 200,
    'is status 429 (rate limited)': (r) => r.status === 429,
  });

  // Small sleep to ensure we overwhelm the localLimiterCache burst allowance
  // but also give time to measure progressive throttling delays.
  sleep(0.05);
}
