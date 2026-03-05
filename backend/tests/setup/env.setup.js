// ─── Dummy Environment Variables for Tests ────────────────────────────────────
// Required to pass strict boot-time validation after fallbacks were removed.

process.env.JWT_SECRET = 'testsecret';
process.env.JWT_REFRESH_SECRET = 'refreshsecret';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.FROM_EMAIL = 'noreply@test.com';
