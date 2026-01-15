const request = require('supertest');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Mock the database connection function
jest.mock('../config/database', () => jest.fn());

// Import app after mocking
const app = require('../server');

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

    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/vlogsphere-test';
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  afterAll(async () => {
    // Clean up and close connection
    await User.deleteMany({});
    await mongoose.connection.close();
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
      password: 'password123',
    };

    // Register user
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send(userData);

    expect(registerRes.status).toBe(201);

    return {
      user: registerRes.body.user,
      token: registerRes.body.token,
      refreshToken: registerRes.body.refreshToken,
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
      .send({ refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.accessToken).toBeDefined();
    expect(refreshRes.body.refreshToken).toBeDefined();

    // New tokens should be different
    expect(refreshRes.body.refreshToken).not.toBe(refreshToken);

    // Version should be incremented
    user = await User.findOne({ email: 'test@example.com' });
    expect(user.tokenVersion).toBe(2);
  });

  test('SECURITY: Old refresh token should become invalid after use (single-use)', async () => {
    const { refreshToken: token1 } = await createAndLoginUser();

    // Use token1 to get token2
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: token1 });

    expect(refreshRes.status).toBe(200);
    const token2 = refreshRes.body.refreshToken;

    // Try to use token1 again (should fail)
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: token1 });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.success).toBe(false);
    expect(reuseRes.body.error.message).toMatch(/invalid|revoked|reuse/i);

    // Verify token2 is also now invalid (session should be revoked)
    const token2Res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: token2 });

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
      .send({ refreshToken: token1 });
    const token2 = refresh1.body.refreshToken;

    // Refresh to get token3
    const refresh2 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: token2 });
    const token3 = refresh2.body.refreshToken;

    // Now attempt to use token1 (old token) - should trigger revocation
    const reuseRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: token1 });

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.message).toMatch(/reuse|revoked/i);

    // Verify token3 (the current token) is also invalid
    const token3Res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: token3 });

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
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.message).toMatch(/revoked/i);
  });

  test('SECURITY: Token family must match for refresh to succeed', async () => {
    // Create two users with different token families
    const user1 = await createAndLoginUser();

    await User.deleteMany({});

    const user2Data = {
      username: 'testuser2',
      email: 'test2@example.com',
      password: 'password123',
    };

    const user2Res = await request(app)
      .post('/api/auth/register')
      .send(user2Data);

    const user2RefreshToken = user2Res.body.refreshToken;

    // Decode user2's token to get tokenFamily
    const decoded = jwt.verify(user2RefreshToken, process.env.JWT_REFRESH_SECRET);

    // Manually change user2's tokenFamily in database
    const user2 = await User.findOne({ email: 'test2@example.com' });
    user2.tokenFamily = 'different-family';
    await user2.save();

    // Attempt to refresh should fail (family mismatch)
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user2RefreshToken });

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
      .send({ refreshToken });

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.message).toMatch(/invalid/i);
  });

  test('Normal authentication flow: Login -> Refresh -> Refresh should work', async () => {
    // Login
    const userData = {
      username: 'normaluser',
      email: 'normal@example.com',
      password: 'password123',
    };

    await request(app)
      .post('/api/auth/register')
      .send(userData);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: userData.email, password: userData.password });

    expect(loginRes.status).toBe(200);
    let { refreshToken } = loginRes.body;

    // First refresh
    const refresh1 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

    expect(refresh1.status).toBe(200);
    refreshToken = refresh1.body.refreshToken;

    // Second refresh
    const refresh2 = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });

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
