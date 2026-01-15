const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../models/User');

describe('GET /api/users/profile/:username', () => {
  let testUser;

  beforeAll(async () => {
    // Create a test user
    testUser = await User.create({
      username: 'testuser123',
      email: 'testuser123@example.com',
      password: 'password123',
      bio: 'Test bio',
      avatar: 'https://example.com/avatar.jpg',
    });
  });

  afterAll(async () => {
    // Clean up
    await User.deleteMany({ username: 'testuser123' });
    await mongoose.connection.close();
  });

  it('should return user data when username exists', async () => {
    const response = await request(app)
      .get(`/api/users/profile/${testUser.username}`)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.username).toBe('testuser123');
    expect(response.body.data.bio).toBe('Test bio');
    expect(response.body.data.followerCount).toBeDefined();
    expect(response.body.data.followingCount).toBeDefined();
    expect(response.body.data.password).toBeUndefined(); // Password should not be returned
  });

  it('should return 404 when username does not exist', async () => {
    const response = await request(app)
      .get('/api/users/profile/nonexistentuser999')
      .expect(404);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeDefined();
  });

  it('should not require authentication', async () => {
    // This should work without auth token
    const response = await request(app)
      .get(`/api/users/profile/${testUser.username}`)
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
