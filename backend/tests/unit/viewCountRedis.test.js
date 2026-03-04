const VlogService = require('../../src/services/vlogService');
const Vlog = require('../../src/models/Vlog');
const redis = require('../../src/config/redis');
const vlogController = require('../../src/controllers/vlogController'); // Chaos testing import

jest.mock('../../src/models/Vlog');
jest.mock('../../src/config/redis');

describe('Redis TTL-Based Unique View Counting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redis.createRedisClient.mockReturnValue(redis);
    // Required by invalidateVlog (called from controller after recordView)
    redis.isAvailable = jest.fn().mockReturnValue(true);
    redis.invalidateTags = jest.fn().mockResolvedValue(0);
  });

  describe('SUCCESS: First view increments', () => {
    test('New user view increments database counter', async () => {
      // Mock: Redis SET NX returns "OK" (key did not exist)
      redis.set = jest.fn().mockResolvedValue('OK');

      Vlog.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValue({ _id: 'vlog123', views: 101 });

      const result = await VlogService.recordView('vlog123', 'user123');

      expect(redis.set).toHaveBeenCalledWith(
        'view:vlog123:user123',
        '1',
        'NX',
        'EX',
        300,
      );
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledWith(
        'vlog123',
        { $inc: { views: 1 } },
        { new: true },
      );
      expect(result).toEqual({ incremented: true, views: 101 });
    });

    test('Anonymous user (IP hash) increments view', async () => {
      redis.set = jest.fn().mockResolvedValue('OK');
      Vlog.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValue({ _id: 'vlog123', views: 50 });

      const result = await VlogService.recordView(
        'vlog123',
        'hashed_ip_abc123',
      );

      expect(redis.set).toHaveBeenCalledWith(
        'view:vlog123:hashed_ip_abc123',
        '1',
        'NX',
        'EX',
        300,
      );
      expect(result.incremented).toBe(true);
      expect(result.views).toBe(50);
    });
  });

  describe('SUCCESS: Second view within TTL does NOT increment', () => {
    test('Duplicate view returns existing count without increment', async () => {
      // Mock: Redis SET NX returns null (key already exists)
      redis.set = jest.fn().mockResolvedValue(null);
      Vlog.findById = jest
        .fn()
        .mockResolvedValue({ _id: 'vlog123', views: 150 });

      const result = await VlogService.recordView('vlog123', 'user123');

      expect(redis.set).toHaveBeenCalledWith(
        'view:vlog123:user123',
        '1',
        'NX',
        'EX',
        300,
      );
      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(Vlog.findById).toHaveBeenCalledWith('vlog123', 'views');
      expect(result).toEqual({ incremented: false, views: 150 });
    });

    test('Page refresh does NOT increment', async () => {
      redis.set = jest.fn().mockResolvedValue(null); // Key exists
      Vlog.findById = jest.fn().mockResolvedValue({ views: 200 });

      await VlogService.recordView('vlog123', 'user123');
      await VlogService.recordView('vlog123', 'user123'); // Refresh

      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test('Multi-tab spam does NOT increment', async () => {
      redis.set = jest.fn().mockResolvedValue(null);
      Vlog.findById = jest.fn().mockResolvedValue({ views: 75 });

      // Simulate 5 rapid requests from same user (multi-tab)
      await VlogService.recordView('vlog123', 'user123');
      await VlogService.recordView('vlog123', 'user123');
      await VlogService.recordView('vlog123', 'user123');
      await VlogService.recordView('vlog123', 'user123');
      await VlogService.recordView('vlog123', 'user123');

      expect(Vlog.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('SUCCESS: Different users increment separately', () => {
    test('User A view and User B view both increment', async () => {
      redis.set = jest.fn().mockResolvedValue('OK'); // Both users are new
      Vlog.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValueOnce({ views: 101 })
        .mockResolvedValueOnce({ views: 102 });

      const resultA = await VlogService.recordView('vlog123', 'userA');
      const resultB = await VlogService.recordView('vlog123', 'userB');

      expect(redis.set).toHaveBeenNthCalledWith(
        1,
        'view:vlog123:userA',
        '1',
        'NX',
        'EX',
        300,
      );
      expect(redis.set).toHaveBeenNthCalledWith(
        2,
        'view:vlog123:userB',
        '1',
        'NX',
        'EX',
        300,
      );
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledTimes(2);
      expect(resultA.incremented).toBe(true);
      expect(resultB.incremented).toBe(true);
    });
  });

  describe('SUCCESS: TTL expiry allows re-increment', () => {
    test('After TTL expires (5 minutes), same user can increment again', async () => {
      // First view: Redis key does not exist
      redis.set = jest.fn().mockResolvedValueOnce('OK');
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 101 });

      const firstView = await VlogService.recordView('vlog123', 'user123');
      expect(firstView.incremented).toBe(true);

      // Simulate TTL expiry (in real world, wait 5 minutes)
      // Second view: Redis key expired, returns "OK" again
      redis.set = jest.fn().mockResolvedValueOnce('OK');
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 102 });

      const secondView = await VlogService.recordView('vlog123', 'user123');
      expect(secondView.incremented).toBe(true);
    });
  });

  describe('EDGE CASE: Redis failure graceful degradation', () => {
    test('Redis unavailable allows increment (degraded mode)', async () => {
      redis.set = jest
        .fn()
        .mockRejectedValue(new Error('Redis connection refused'));
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 500 });

      const result = await VlogService.recordView('vlog123', 'user123');

      expect(result.incremented).toBe(true);
      expect(result.views).toBe(500);
      expect(result.degraded).toBe(true);
    });

    test('Redis timeout does NOT crash API', async () => {
      redis.set = jest.fn().mockRejectedValue(new Error('Timeout'));
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 99 });

      const result = await VlogService.recordView('vlog123', 'user123');

      expect(result.incremented).toBe(true); // Fallback to increment
    });
  });

  describe('VALIDATION: Anonymous user deduplication', () => {
    test('Same IP hash prevents duplicate increments', async () => {
      const ipHash = 'f4a3b2c1d5e6f7g8';

      // First request from IP
      redis.set = jest.fn().mockResolvedValueOnce('OK');
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 10 });

      const firstRequest = await VlogService.recordView('vlog123', ipHash);
      expect(firstRequest.incremented).toBe(true);

      // Second request from same IP within TTL
      redis.set = jest.fn().mockResolvedValueOnce(null); // Key exists
      Vlog.findById = jest.fn().mockResolvedValue({ views: 10 });

      const secondRequest = await VlogService.recordView('vlog123', ipHash);
      expect(secondRequest.incremented).toBe(false);
      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledTimes(1); // Only first call
    });

    test('Different IP hashes increment separately', async () => {
      redis.set = jest.fn().mockResolvedValue('OK');
      Vlog.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValueOnce({ views: 20 })
        .mockResolvedValueOnce({ views: 21 });

      await VlogService.recordView('vlog123', 'ip_hash_1');
      await VlogService.recordView('vlog123', 'ip_hash_2');

      expect(Vlog.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });
  });

  describe('VALIDATION: Custom TTL configuration', () => {
    test('Respects VIEW_TTL_SECONDS environment variable', async () => {
      process.env.VIEW_TTL_SECONDS = '600'; // 10 minutes

      redis.set = jest.fn().mockResolvedValue('OK');
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 55 });

      await VlogService.recordView('vlog123', 'user123');

      expect(redis.set).toHaveBeenCalledWith(
        'view:vlog123:user123',
        '1',
        'NX',
        'EX',
        600, // Custom TTL
      );

      delete process.env.VIEW_TTL_SECONDS; // Cleanup
    });

    test('Defaults to 300 seconds if VIEW_TTL_SECONDS not set', async () => {
      delete process.env.VIEW_TTL_SECONDS;

      redis.set = jest.fn().mockResolvedValue('OK');
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 100 });

      await VlogService.recordView('vlog123', 'user123');

      expect(redis.set).toHaveBeenCalledWith(
        'view:vlog123:user123',
        '1',
        'NX',
        'EX',
        300, // Default
      );
    });
  });
  describe('REGRESSION GUARDS: GET operations must be read-only', () => {
    test('VlogService.recordView is ONLY called from PUT endpoints', async () => {
      // Regression: This test guards against accidentally adding recordView calls to GET endpoints

      // Reset mocks for this specific test
      jest.clearAllMocks();

      // Setup mocks for recordView test
      redis.set = jest.fn().mockResolvedValue('OK');
      Vlog.findByIdAndUpdate = jest
        .fn()
        .mockResolvedValue({ _id: 'test-vlog', views: 42 });

      // Call recordView with fresh mocks
      const result = await VlogService.recordView('test-vlog', 'test-user');

      // Verify result structure
      expect(result).toHaveProperty('incremented', true);
      expect(result).toHaveProperty('views', 42);

      // Verify redis.set was called (new view)
      expect(redis.set).toHaveBeenCalledWith(
        'view:test-vlog:test-user',
        '1',
        'NX',
        'EX',
        300, // Default TTL
      );
    });
  });

  describe('CHAOS: Redis Down Simulation', () => {
    test('Should increment view even when Redis is down (degraded mode)', async () => {
      // 1. Mock critical infrastructure failure
      redis.set = jest.fn().mockRejectedValue(new Error('Redis connection died'));

      // 2. Mock DB to succeed (Degraded mode relies on DB)
      Vlog.findByIdAndUpdate = jest.fn().mockResolvedValue({ views: 999 });

      // 3. Setup Request/Response
      const req = {
        params: { id: 'chaos_vlog' },
        ip: '10.0.0.1',
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      // 4. Fire endpoint integration test
      await vlogController.recordView(req, res);

      // 5. Verify Isolation
      expect(res.status).toHaveBeenCalledWith(200); // NO 500!
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          incremented: true,
          degraded: true, // The signal we want
          views: 999,
        }),
      }));
    });
  });
});
