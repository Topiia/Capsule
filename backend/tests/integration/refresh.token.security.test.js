const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');

// Mock the database connection function

// Mock Resend email services before importing app
jest.mock('../../src/utils/sendEmail', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../src/utils/sendEmailSync', () => ({
  sendEmailSync: jest.fn().mockReturnValue({ success: true }),
}));

// Import app after mocking
const app = require('../../src/app');

// Helper to extract cookie value
function extractCookie(res, name) {
  const cookies = res.headers['set-cookie'] || [];
  const cookie = cookies.find((c) => c.startsWith(`${name}=`));
  if (!cookie) return null;
  return cookie.split(';')[0].split('=')[1];
}

/**
 * SECURITY TEST SUITE: Refresh Token Rotation & Secure Storage
 *
 * Tests P0 security requirements:
 * 1. Refresh tokens are single-use
 * 2. Tokens are stored as bcrypt hashes, not plaintext
 * 3. Token reuse triggers session revocation
 * 4. Session revocation prevents all token use
 * 5. Normal token rotation works correctly
 */

describe('Refresh Token Security Tests', () => {
  beforeAll(async () => {
    // Set test environment variables
    process.env.JWT_SECRET = 'test-secret-key-for-testing';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
    process.env.JWT_EXPIRE = '30m';
    process.env.JWT_REFRESH_EXPIRE = '30d';
    process.env.NODE_ENV = 'test';
  });

  afterAll(async () => {
    // Clean up and close connection
    await User.deleteMany({});
  });

  beforeEach(async () => {
    // Clear users before each test
    await User.deleteMany({});
  });

  // Helper function to create and login a user
  const createAndLoginUser = async () => {
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123',
    };

    // Register user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(userData);

    expect(registerRes.status).toBe(201);

    return {
      user: registerRes.body.user,
      token: extractCookie(registerRes, 'token'),
      refreshToken: extractCookie(registerRes, 'refreshToken'),
    };
  };

  test('SECURITY: Refresh tokens should be stored as bcrypt hashes, not plaintext', async () => {
    const { refreshToken } = await createAndLoginUser();

    // Fetch user from database
    const user = await User.findOne({ email: 'test@example.com' });

    // Verify refreshTokenHash exists and is NOT the plaintext token
    expect(user.refreshTokenHash).toBeDefined();
    expect(user.refreshTokenHash).not.toBe('');
    expect(user.refreshTokenHash).not.toBe(refreshToken);

    // Verify it's a bcrypt hash (starts with $2b$ or $2a$)
    expect(user.refreshTokenHash).toMatch(/^\$2[ab]\$/);

    // Verify plaintext token can be verified against hash
    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    expect(isValid).toBe(true);

    // Verify the old refreshToken field does not exist
    expect(user.refreshToken).toBeUndefined();
  });

  test('SECURITY: Token rotation should increment version and generate new tokens', async () => {
    const { refreshToken } = await createAndLoginUser();

    // Check initial version
    let user = await User.findOne({ email: 'test@example.com' });
    expect(user.tokenVersion).toBe(1);

    // Refresh token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(extractCookie(refreshRes, 'token')).toBeDefined();
    expect(extractCookie(refreshRes, 'refreshToken')).toBeDefined();

    // New tokens should be different
    expect(extractCookie(refreshRes, 'refreshToken')).not.toBe(refreshToken);

    // Version should be incremented
    user = await User.findOne({ email: 'test@example.com' });
    expect(user.tokenVersion).toBe(2);
  });

  test('SECURITY: Old refresh token should become invalid after use (single-use)', async () => {
    const { refreshToken: token1 } = await createAndLoginUser();

    // Use token1 to get token2
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${token1}`);

    expect(refreshRes.status).toBe(200);
    const token2 = extractCookie(refreshRes, 'refreshToken');

    // Try to use token1 again (should fail)
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${token1}`);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.success).toBe(false);
    expect(reuseRes.body.error.message).toMatch(/invalid|revoked|reuse/i);

    // Verify token2 is also now invalid (session should be revoked)
    const token2Res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${token2}`);

    expect(token2Res.status).toBe(401);

    // Verify user session is revoked
    const user = await User.findOne({ email: 'test@example.com' });
    expect(user.revokedAt).not.toBeNull();
  });

  test('SECURITY: Token reuse should revoke ALL sessions', async () => {
    const { refreshToken: token1 } = await createAndLoginUser();

    // Refresh to get token2
    const refresh1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${token1}`);
    const token2 = extractCookie(refresh1, 'refreshToken');

    // Refresh to get token3
    const refresh2 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${token2}`);
    const token3 = extractCookie(refresh2, 'refreshToken');

    // Now attempt to use token1 (old token) - should trigger revocation
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${token1}`);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.message).toMatch(/reuse|revoked/i);

    // Verify token3 (the current token) is also invalid
    const token3Res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${token3}`);

    expect(token3Res.status).toBe(401);

    // Verify revokedAt is set
    const user = await User.findOne({ email: 'test@example.com' });
    expect(user.revokedAt).not.toBeNull();
    expect(user.tokenVersion).toBe(0);
    expect(user.tokenFamily).toBe('');
    expect(user.refreshTokenHash).toBe('');
  });

  test('SECURITY: Revoked sessions should reject all refresh attempts', async () => {
    const { refreshToken } = await createAndLoginUser();

    // Manually revoke session
    const user = await User.findOne({ email: 'test@example.com' });
    user.revokeAllSessions();
    await user.save();

    // Attempt to refresh should fail
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.message).toMatch(/revoked/i);
  });

  test('SECURITY: Token family must match for refresh to succeed', async () => {
    // Create two users with different token families
    const _user1 = await createAndLoginUser(); // eslint-disable-line no-unused-vars

    await User.deleteMany({});

    const user2Data = {
      username: 'testuser2',
      email: 'test2@example.com',
      password: 'Password123',
    };

    const user2Res = await request(app)
      .post('/api/auth/register')
      .send(user2Data);

    const user2RefreshToken = extractCookie(user2Res, 'refreshToken');

    // Decode user2's token to get tokenFamily
    // eslint-disable-next-line no-unused-vars
    const decoded = jwt.verify(
      user2RefreshToken,
      process.env.JWT_REFRESH_SECRET,
    );

    // Manually change user2's tokenFamily in database
    const user2 = await User.findOne({ email: 'test2@example.com' });
    user2.tokenFamily = 'different-family';
    await user2.save();

    // Attempt to refresh should fail (family mismatch)
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${user2RefreshToken}`);

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.message).toMatch(/invalid/i);
  });

  test('SECURITY: Modified token hash should reject refresh', async () => {
    const { refreshToken } = await createAndLoginUser();

    // Corrupt the stored hash
    const user = await User.findOne({ email: 'test@example.com' });
    user.refreshTokenHash = await bcrypt.hash('wrong-token', 10);
    await user.save();

    // Attempt to refresh should fail
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.message).toMatch(/invalid/i);
  });

  test('Normal authentication flow: Login -> Refresh -> Refresh should work', async () => {
    // Login
    const userData = {
      username: 'normaluser',
      email: 'normal@example.com',
      password: 'Password123',
    };

    await request(app).post('/api/auth/register').send(userData);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userData.email, password: userData.password });

    expect(loginRes.status).toBe(200);
    let refreshToken = extractCookie(loginRes, 'refreshToken');

    // First refresh
    const refresh1 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(refresh1.status).toBe(200);
    refreshToken = extractCookie(refresh1, 'refreshToken');

    // Second refresh
    const refresh2 = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', `refreshToken=${refreshToken}`);

    expect(refresh2.status).toBe(200);

    // Verify version incremented correctly
    const user = await User.findOne({ email: userData.email });
    expect(user.tokenVersion).toBe(3); // Initial 1, +1 for each refresh = 3
    expect(user.revokedAt).toBeNull();
  });

  test('Access token validation should remain unchanged', async () => {
    const { token } = await createAndLoginUser();

    // Access protected route with access token
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.user).toBeDefined();
  });
});
