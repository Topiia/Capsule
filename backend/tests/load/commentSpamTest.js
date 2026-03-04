import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '30s',
};

export default function () {
  const payload = JSON.stringify({
    text: 'spam comment',
  });
  const headers = { 'Content-Type': 'application/json' };

  // Using arbitrary valid object ID
  const res = http.post('http://localhost:5000/api/vlogs/60d5ecb54d39f7158ca1e915/comments', payload, { headers });

  check(res, {
    'status is 429 (rate limited)': (r) => r.status === 429,
    'status is 401/400/404 (rejected prior to limits)': (r) => r.status === 401 || r.status === 400 || r.status === 404,
  });

  sleep(0.01);
}
