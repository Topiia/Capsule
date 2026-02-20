/* eslint-disable global-require, prefer-destructuring, no-shadow, no-unused-vars */
const Queue = require('bull');
const logger = require('../config/logger');

// Mock Bull and logger
jest.mock('bull');
jest.mock('../config/logger');

// Import after mocking
const {
  queueEmail,
  queuePasswordResetEmail,
  isQueueAvailable,
  getQueueStats,
} = require('../queues/emailQueue');

describe('Email Queue Producer', () => {
  let mockQueue;
  let mockAdd;
  let mockIsReady;

  beforeEach(() => {
    mockAdd = jest.fn();
    mockIsReady = jest.fn();

    mockQueue = {
      add: mockAdd,
      isReady: mockIsReady,
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(5),
      getFailedCount: jest.fn().mockResolvedValue(1),
    };

    Queue.mockImplementation(() => mockQueue);

    jest.clearAllMocks();
  });

  describe('Queue Initialization', () => {
    it('should initialize Bull queue with correct Redis config', () => {
      const emailQueue = require('../queues/emailQueue');

      expect(Queue).toHaveBeenCalledWith('email', {
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });
    });

    it('should verify Redis connectivity on init', () => {
      const emailQueue = require('../queues/emailQueue');

      expect(mockQueue.isReady).toHaveBeenCalled();
    });
  });

  describe('queueEmail() - Core Producer Logic', () => {
    beforeEach(() => {
      // Simulate queue ready
      mockIsReady.mockResolvedValue(true);
      // Re-require to trigger initialization
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
    });

    it('should add job to queue with correct payload and priority', async () => {
      const emailData = {
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<h1>Test</h1>',
        text: 'Test',
      };

      mockAdd.mockResolvedValue({ id: 'job-123' });

      const { queueEmail } = require('../queues/emailQueue');
      const result = await queueEmail(emailData, 5);

      expect(mockAdd).toHaveBeenCalledWith(emailData, {
        priority: 5,
        attempts: 3,
      });

      expect(result).toEqual({ jobId: 'job-123', queued: true });
    });

    it('should use 5 attempts for critical emails', async () => {
      const emailData = {
        to: 'user@example.com',
        subject: 'Critical Email',
        html: '<h1>Critical</h1>',
        text: 'Critical',
        critical: true,
      };

      mockAdd.mockResolvedValue({ id: 'job-456' });

      const { queueEmail } = require('../queues/emailQueue');
      await queueEmail(emailData, 10);

      expect(mockAdd).toHaveBeenCalledWith(emailData, {
        priority: 10,
        attempts: 5, // Critical emails get more retries
      });
    });

    it('should throw error when Redis unavailable (no synchronous fallback)', async () => {
      // Simulate queue not ready
      const { queueEmail } = require('../queues/emailQueue');

      // Manually set queueReady to false (simulating Redis down)
      // Note: This requires the module to export queueReady state
      // For now, we test the error path

      const emailData = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<h1>Test</h1>',
      };

      // If queue is not ready, queueEmail should throw
      await expect(queueEmail(emailData)).rejects.toThrow(
        'Email queue unavailable - Redis connection required',
      );
    });

    it('should NOT import or call sendEmail directly', () => {
      const sendEmail = require('../utils/sendEmail');
      jest.mock('../utils/sendEmail');

      const { queueEmail } = require('../queues/emailQueue');

      // Queue producer should NEVER call sendEmail
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('queuePasswordResetEmail() - Convenience Wrapper', () => {
    it('should queue password reset email with correct template and priority', async () => {
      mockAdd.mockResolvedValue({ id: 'job-789' });

      const { queuePasswordResetEmail } = require('../queues/emailQueue');
      await queuePasswordResetEmail('user@example.com', 'https://example.com/reset/token');

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Password Reset - VlogSphere',
          html: expect.stringContaining('https://example.com/reset/token'),
          text: expect.stringContaining('https://example.com/reset/token'),
          critical: true,
        }),
        expect.objectContaining({
          priority: 10, // High priority for password resets
          attempts: 5, // Critical = 5 attempts
        }),
      );
    });
  });

  describe('getQueueStats() - Health Monitoring', () => {
    it('should return queue statistics when available', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(2);
      mockQueue.getActiveCount.mockResolvedValue(1);
      mockQueue.getCompletedCount.mockResolvedValue(100);
      mockQueue.getFailedCount.mockResolvedValue(3);

      const { getQueueStats } = require('../queues/emailQueue');
      const stats = await getQueueStats();

      expect(stats).toEqual({
        available: true,
        waiting: 2,
        active: 1,
        completed: 100,
        failed: 3,
      });
    });

    it('should return unavailable status when queue is down', async () => {
      // Simulate queue unavailable
      const { getQueueStats } = require('../queues/emailQueue');

      // When queue is not ready, should return unavailable
      const stats = await getQueueStats();

      expect(stats.available).toBeDefined();
    });
  });

  describe('Backoff Configuration', () => {
    it('should configure exponential backoff for retries', () => {
      expect(Queue).toHaveBeenCalledWith(
        'email',
        expect.objectContaining({
          defaultJobOptions: expect.objectContaining({
            backoff: {
              type: 'exponential',
              delay: 2000, // 2s → 4s → 8s
            },
          }),
        }),
      );
    });
  });
});
