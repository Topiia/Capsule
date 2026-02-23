/* eslint-disable global-require, prefer-destructuring, no-shadow, no-unused-vars */
jest.mock('bull');
jest.mock('../config/logger');
jest.mock('../utils/sendEmailSync', () => ({
  sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
}));
jest.mock('../config/email', () => ({
  resend: {
    apiKey: 'test-api-key',
    fromEmail: 'noreply@testdomain.com',
    fromName: 'Capsule',
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,
  },
  validateEmailConfig: jest.fn().mockReturnValue(true),
  isRedisConfigured: jest.fn().mockReturnValue(true),
}));

const Queue = require('bull');
const logger = require('../config/logger');
const { sendEmailSync } = require('../utils/sendEmailSync');

describe('Email Queue Producer', () => {
  let mockQueue;
  let mockAdd;
  let mockIsReady;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAdd = jest.fn();
    mockIsReady = jest.fn().mockResolvedValue(true);

    mockQueue = {
      add: mockAdd,
      isReady: mockIsReady,
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(5),
      getFailedCount: jest.fn().mockResolvedValue(1),
      getDelayedCount: jest.fn().mockResolvedValue(0),
    };

    Queue.mockImplementation(() => mockQueue);
  });

  describe('Queue Initialization', () => {
    it('should initialize Bull queue with correct Redis config and defaultJobOptions', () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      const QueueFresh = require('bull');
      const freshMockQueue = {
        add: jest.fn(),
        isReady: jest.fn().mockResolvedValue(true),
      };
      QueueFresh.mockImplementation(() => freshMockQueue);

      require('../queues/emailQueue');

      expect(QueueFresh).toHaveBeenCalledWith('email', {
        redis: {
          host: 'localhost',
          port: 6379,
          password: undefined,
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

    it('should call isReady to verify Redis connectivity on init', () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      const QueueFresh = require('bull');
      const freshIsReady = jest.fn().mockResolvedValue(true);
      QueueFresh.mockImplementation(() => ({ add: jest.fn(), isReady: freshIsReady }));

      require('../queues/emailQueue');

      expect(freshIsReady).toHaveBeenCalled();
    });
  });

  describe('queueEmail() — Queue Ready Path', () => {
    let queueEmail;

    beforeEach(async () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      mockAdd = jest.fn().mockResolvedValue({ id: 'job-123' });
      mockIsReady = jest.fn().mockResolvedValue(true);

      const QueueFresh = require('bull');
      QueueFresh.mockImplementation(() => ({
        add: mockAdd,
        isReady: mockIsReady,
      }));

      // Load module — isReady resolves and sets queueReady = true
      require('../queues/emailQueue');
      // Wait for the async isReady() .then() to fire
      await Promise.resolve();

      ({ queueEmail } = require('../queues/emailQueue'));
    });

    it('should add job to queue with correct payload and priority', async () => {
      const emailData = {
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<h1>Test</h1>',
        text: 'Test',
      };

      mockAdd.mockResolvedValue({ id: 'job-123' });

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

      await queueEmail(emailData, 10);

      expect(mockAdd).toHaveBeenCalledWith(emailData, {
        priority: 10,
        attempts: 5,
      });
    });
  });

  describe('queueEmail() — Fallback Path (Redis Unavailable)', () => {
    it('should send synchronously via fallback when queue is not ready', async () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');

      const mockSendEmailSync = jest.fn().mockResolvedValue({ id: 'sync-fallback-id' });
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: mockSendEmailSync,
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      // Make isReady reject — queue will NOT be ready
      const QueueFresh = require('bull');
      QueueFresh.mockImplementation(() => ({
        add: jest.fn(),
        isReady: jest.fn().mockRejectedValue(new Error('Redis down')),
      }));

      require('../queues/emailQueue');
      // Wait for the async isReady() .catch() to fire
      await Promise.resolve();
      await Promise.resolve();

      const { queueEmail: queueEmailFallback } = require('../queues/emailQueue');

      const emailData = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<h1>Test</h1>',
      };

      const result = await queueEmailFallback(emailData);

      expect(mockSendEmailSync).toHaveBeenCalledWith(emailData);
      expect(result).toEqual({ emailId: 'sync-fallback-id', fallback: true });
    });
  });

  describe('queuePasswordResetEmail() — Convenience Wrapper', () => {
    it('should queue password reset email with correct subject, template, and priority', async () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      const freshAdd = jest.fn().mockResolvedValue({ id: 'job-789' });
      const QueueFresh = require('bull');
      QueueFresh.mockImplementation(() => ({
        add: freshAdd,
        isReady: jest.fn().mockResolvedValue(true),
      }));

      require('../queues/emailQueue');
      await Promise.resolve();

      const { queuePasswordResetEmail } = require('../queues/emailQueue');
      await queuePasswordResetEmail('user@example.com', 'https://example.com/reset/token');

      expect(freshAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Password Reset - Capsule',
          html: expect.stringContaining('https://example.com/reset/token'),
          text: expect.stringContaining('https://example.com/reset/token'),
          critical: true,
        }),
        expect.objectContaining({
          priority: 10,
          attempts: 5,
        }),
      );
    });
  });

  describe('getQueueStats() — Health Monitoring', () => {
    it('should return queue statistics when queue is available', async () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      const QueueFresh = require('bull');
      QueueFresh.mockImplementation(() => ({
        add: jest.fn(),
        isReady: jest.fn().mockResolvedValue(true),
        getWaitingCount: jest.fn().mockResolvedValue(2),
        getActiveCount: jest.fn().mockResolvedValue(1),
        getCompletedCount: jest.fn().mockResolvedValue(100),
        getFailedCount: jest.fn().mockResolvedValue(3),
        getDelayedCount: jest.fn().mockResolvedValue(0),
      }));

      require('../queues/emailQueue');
      await Promise.resolve();

      const { getQueueStats } = require('../queues/emailQueue');
      const stats = await getQueueStats();

      expect(stats).toEqual({
        available: true,
        waiting: 2,
        active: 1,
        completed: 100,
        failed: 3,
        delayed: 0,
        total: 106,
      });
    });

    it('should return unavailable status when queue is not ready', async () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      const QueueFresh = require('bull');
      QueueFresh.mockImplementation(() => ({
        add: jest.fn(),
        isReady: jest.fn().mockRejectedValue(new Error('Redis down')),
      }));

      require('../queues/emailQueue');
      await Promise.resolve();
      await Promise.resolve();

      const { getQueueStats } = require('../queues/emailQueue');
      const stats = await getQueueStats();

      expect(stats.available).toBe(false);
    });
  });

  describe('Backoff Configuration', () => {
    it('should configure exponential backoff for retries', () => {
      jest.resetModules();
      jest.mock('bull');
      jest.mock('../config/logger');
      jest.mock('../utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
      }));
      jest.mock('../config/email', () => ({
        resend: { apiKey: 'test-api-key', fromEmail: 'noreply@testdomain.com', fromName: 'Capsule' },
        redis: { host: 'localhost', port: 6379, password: undefined },
        validateEmailConfig: jest.fn().mockReturnValue(true),
        isRedisConfigured: jest.fn().mockReturnValue(true),
      }));

      const QueueFresh = require('bull');
      QueueFresh.mockImplementation(() => ({
        add: jest.fn(),
        isReady: jest.fn().mockResolvedValue(true),
      }));

      require('../queues/emailQueue');

      expect(QueueFresh).toHaveBeenCalledWith(
        'email',
        expect.objectContaining({
          defaultJobOptions: expect.objectContaining({
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }),
        }),
      );
    });
  });
});
