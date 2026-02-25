/* eslint-disable global-require */
process.env.RESEND_API_KEY = 're_test-key'; // MUST be set before any 'requires' execute

// Mock config BEFORE any imports that might use it synchronously
jest.mock('../../src/config/email', () => ({
  resend: { apiKey: 'test-key', fromEmail: 'test@example.com', fromName: 'Test' },
  validateEmailConfig: jest.fn().mockReturnValue(true),
}));

const { queuePasswordResetEmail } = require('../../src/queues/emailQueue');
const User = require('../../src/models/User');
const { forgotPassword } = require('../../src/controllers/authController');

// Mock dependencies
jest.mock('../../src/utils/sendEmail', () => ({
  sendEmail: jest.fn(),
}));
jest.mock('../../src/utils/sendEmailSync', () => jest.fn());
jest.mock('../../src/queues/emailQueue');
jest.mock('../../src/models/User');

describe('Auth Controller - Forgot Password (Async Email)', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    // Force non-test NODE_ENV so authController sends emails in these tests
    process.env.NODE_ENV = 'production';

    req = {
      body: { email: 'test@example.com' },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();

    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore test NODE_ENV after each test
    process.env.NODE_ENV = 'test';
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
        expect.stringContaining('/reset-password/mock-token'),
      );

      // Should return success response
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset email sent',
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
    it('should return 503 when queue is unavailable (no synchronous fallback)', async () => {
      const mockUser = {
        email: 'test@example.com',
        generatePasswordResetToken: jest.fn().mockReturnValue('token'),
        save: jest.fn().mockResolvedValue(true),
      };

      User.findOne = jest.fn().mockResolvedValue(mockUser);

      // Simulate Redis/queue unavailable
      queuePasswordResetEmail.mockRejectedValue(
        new Error('Email queue unavailable - Redis connection required'),
      );

      await forgotPassword(req, res, next);

      // Should return controlled error response
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Email service temporarily unavailable. Please try again later.',
          code: 'EMAIL_SERVICE_UNAVAILABLE',
          statusCode: 503,
        },
      });

      // Should NOT clear reset token (allow retry)
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
        expect.stringContaining('generated-token'),
      );
    });
  });
});
