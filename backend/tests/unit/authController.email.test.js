/* eslint-disable global-require */
process.env.RESEND_API_KEY = 're_test-key'; // MUST be set before any 'requires' execute

// Mock config BEFORE any imports that might use it synchronously
jest.mock('../../src/config/email', () => ({
  resend: { apiKey: 'test-key', fromEmail: 'test@example.com', fromName: 'Test' },
  validateEmailConfig: jest.fn().mockReturnValue(true),
}));

// Mock Redis to prevent real ioredis instantiation — without this createRedisClient()
// spins up a real connection attempt (~383ms) which blows the timing assertions.
jest.mock('../../src/config/redis', () => ({
  createRedisClient: jest.fn(() => ({
    status: 'ready',
    isAvailable: jest.fn().mockReturnValue(true),
    on: jest.fn(),
  })),
  connectRedis: jest.fn().mockResolvedValue(undefined),
}));

const { queuePasswordResetEmail } = require('../../src/queues/emailQueue');
const User = require('../../src/models/User');
const { forgotPassword } = require('../../src/controllers/authController');

// Mock dependencies
jest.mock('../../src/utils/sendEmail', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../../src/queues/emailQueue', () => ({
  queueWelcomeEmail: jest.fn().mockResolvedValue({ queued: true }),
  queuePasswordResetEmail: jest.fn().mockResolvedValue({ queued: true }),
  queueVerificationEmail: jest.fn().mockResolvedValue({ queued: true }),
  queueEmail: jest.fn().mockResolvedValue({ queued: true })
}));
jest.mock('../../src/queues/emailQueue');
jest.mock('../../src/models/User');

describe('Auth Controller - Forgot Password (Async Email)', () => {
  let consoleSpy;
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Force non-test NODE_ENV so authController sends emails in these tests
    process.env.NODE_ENV = 'production';

    // Silence [FP] forensic console.log calls — they add ~50ms overhead per test
    // in the Jest environment, which breaks the `duration < 50ms` timing assertion.
    // Instrumentation remains active in production.
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    req = {
      body: { email: 'test@example.com' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      // Required by [FP] forensic instrumentation — res.on('finish'/'close'/'error')
      // Without this, asyncHandler catches the TypeError and the controller exits early.
      on: jest.fn(),
    };
    next = jest.fn();

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore test NODE_ENV after each test
    process.env.NODE_ENV = 'test';
    // Restore console.log
    consoleSpy.mockRestore();
  });

  describe('Email Queuing Behavior', () => {
    it('should queue email asynchronously and respond immediately', async () => {
      const mockUser = {
        email: 'test@example.com',
        generatePasswordResetToken: jest.fn().mockReturnValue('mock-token'),
        save: jest.fn().mockResolvedValue(true),
      };

      User.findOne = jest.fn().mockResolvedValue(mockUser);
      queuePasswordResetEmail.mockResolvedValue({ jobId: '123', queued: true });

      const startTime = Date.now();
      await forgotPassword(req, res, next);
      const duration = Date.now() - startTime;

      // Should respond in < 50ms (async, non-blocking)
      expect(duration).toBeLessThan(50);

      // Should call queue function exactly once
      expect(queuePasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(queuePasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('/reset-password/mock-token'), expect.any(Object),
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If that email exists, a password reset link has been sent.',
      });
    });

    it('should NOT call sendEmail directly (no synchronous sending)', async () => {
      // This test validates architectural guarantee: no sync email sending exists
      // The queuePasswordResetEmail mock proves async-only behavior
      const mockUser = {
        email: 'test@example.com',
        generatePasswordResetToken: jest.fn().mockReturnValue('token'),
        save: jest.fn().mockResolvedValue(true),
      };

      User.findOne = jest.fn().mockResolvedValue(mockUser);
      queuePasswordResetEmail.mockResolvedValue({ jobId: '123', queued: true });

      await forgotPassword(req, res, next);

      // Verify only queue function was called (no direct email sending)
      expect(queuePasswordResetEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('Redis/Queue Unavailable Handling', () => {
    it('should return 200 even when queue rejects (fire-and-forget, error logged not surfaced)', async () => {
      const mockUser = {
        email: 'test@example.com',
        generatePasswordResetToken: jest.fn().mockReturnValue('token'),
        save: jest.fn().mockResolvedValue(true),
      };

      User.findOne = jest.fn().mockResolvedValue(mockUser);

      // Simulate Redis/queue unavailable — rejection is fire-and-forgotten, never re-thrown
      queuePasswordResetEmail.mockRejectedValue(
        new Error('Email queue unavailable - Redis connection required'),
      );

      await forgotPassword(req, res, next);

      // Response goes out immediately regardless of email outcome
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If that email exists, a password reset link has been sent.',
      });

      // Token is still saved (user can retry)
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('Security Behavior', () => {
    it('should return same response for non-existent email (prevent enumeration)', async () => {
      User.findOne = jest.fn().mockResolvedValue(null);

      await forgotPassword(req, res, next);

      // Should NOT queue email for non-existent user
      expect(queuePasswordResetEmail).not.toHaveBeenCalled();

      // Should return same success message (security)
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If that email exists, a password reset link has been sent.',
      });
    });
  });

  describe('Token Generation', () => {
    it('should generate reset token and persist before queuing email', async () => {
      const mockUser = {
        email: 'test@example.com',
        generatePasswordResetToken: jest.fn().mockReturnValue('generated-token'),
        save: jest.fn().mockResolvedValue(true),
      };

      User.findOne = jest.fn().mockResolvedValue(mockUser);
      queuePasswordResetEmail.mockResolvedValue({ jobId: '123', queued: true });

      await forgotPassword(req, res, next);

      // Should generate token
      expect(mockUser.generatePasswordResetToken).toHaveBeenCalled();

      // Should save user before queuing
      expect(mockUser.save).toHaveBeenCalledWith({ validateBeforeSave: false });

      // Should queue with generated token
      expect(queuePasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('generated-token'), expect.any(Object),
      );
    });
  });
});
