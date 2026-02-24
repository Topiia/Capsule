/* eslint-disable global-require, prefer-destructuring, no-promise-executor-return */

describe('Email Queue Producer', () => {
  let mockQueue;
  let mockAdd;
  let mockIsReady;
  let emailQueueModule;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env.NODE_ENV = 'development';

    mockAdd = jest.fn();
    mockIsReady = jest.fn().mockResolvedValue(true);

    mockQueue = {
      add: mockAdd.mockResolvedValue({ id: 'job-123' }),
      isReady: mockIsReady,
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(5),
      getFailedCount: jest.fn().mockResolvedValue(1),
      getDelayedCount: jest.fn().mockResolvedValue(0),
      clean: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(true),
    };

    jest.mock('bull', () => jest.fn(() => mockQueue));
    jest.mock('../../src/config/logger', () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }));
    jest.mock('../../src/utils/sendEmailSync', () => ({
      sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-msg-id' }),
    }));
    jest.mock('../../src/config/email', () => ({
      resend: { apiKey: 'test', fromEmail: 'test', fromName: 'Capsule' },
      redis: { host: 'localhost', port: 6379, password: undefined },
    }));

    emailQueueModule = require('../../src/queues/emailQueue');
  });

  describe('Queue Initialization', () => {
    it('should initialize Bull queue with correct config when createEmailQueue is called', () => {
      emailQueueModule.createEmailQueue();
      const Queue = require('bull');

      expect(Queue).toHaveBeenCalledWith('email', {
        redis: { host: 'localhost', port: 6379, password: undefined },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });
    });

    it('should call isReady to verify Redis connectivity on init', () => {
      emailQueueModule.createEmailQueue();
      expect(mockIsReady).toHaveBeenCalled();
    });
  });

  describe('queueEmail() — Queue Ready Path', () => {
    beforeEach(async () => {
      emailQueueModule.createEmailQueue();
      await Promise.resolve(); // flush microtasks
    });

    it('should add job to queue with correct payload and priority', async () => {
      const emailData = { to: 'user@example.com', subject: 'Test', html: '<p>Test</p>' };
      const result = await emailQueueModule.queueEmail(emailData, 7);

      expect(mockAdd).toHaveBeenCalledWith(emailData, { priority: 7, attempts: 3 });
      expect(result).toEqual({ jobId: 'job-123', queued: true });
    });

    it('should use 5 attempts for critical emails', async () => {
      const emailData = { to: 'test@example.com', critical: true };
      await emailQueueModule.queueEmail(emailData);

      expect(mockAdd).toHaveBeenCalledWith(emailData, { priority: 5, attempts: 5 });
    });

    it('should fallback to sync send if queue.add() fails', async () => {
      const emailData = { to: 'test@example.com', subject: 'Fails' };
      mockAdd.mockRejectedValue(new Error('Queue memory full'));

      const result = await emailQueueModule.queueEmail(emailData);
      const { sendEmailSync } = require('../../src/utils/sendEmailSync');

      expect(sendEmailSync).toHaveBeenCalledWith(emailData);
      expect(result).toEqual({ emailId: 'sync-msg-id', fallback: true });
    });
  });

  describe('queueEmail() — Fallback Path', () => {
    beforeEach(async () => {
      mockIsReady.mockRejectedValue(new Error('Redis connection refused'));
      mockAdd.mockRejectedValue(new Error('Queue unavailable'));
      emailQueueModule.createEmailQueue();
      await Promise.resolve();
    });

    it('should send email synchronously if queue is not ready', async () => {
      const emailData = { to: 'user@example.com', subject: 'Fallback' };
      const result = await emailQueueModule.queueEmail(emailData);
      const { sendEmailSync } = require('../../src/utils/sendEmailSync');

      expect(sendEmailSync).toHaveBeenCalledWith(emailData);
      expect(result).toEqual({ emailId: 'sync-msg-id', fallback: true });
    });
  });

  describe('Convenience Wrappers', () => {
    beforeEach(async () => {
      emailQueueModule.createEmailQueue();
      await Promise.resolve();
    });

    it('queueVerificationEmail should queue with critical priority', async () => {
      await emailQueueModule.queueVerificationEmail('user@test.com', 'https://test');
      expect(mockAdd).toHaveBeenCalled();
      expect(mockAdd.mock.calls[0][1].priority).toBe(10);
    });

    it('queuePasswordResetEmail should queue correctly', async () => {
      await emailQueueModule.queuePasswordResetEmail('user@test.com', 'https://test');
      expect(mockAdd).toHaveBeenCalled();
      expect(mockAdd.mock.calls[0][1].priority).toBe(10);
    });

    it('queueWelcomeEmail should queue correctly', async () => {
      await emailQueueModule.queueWelcomeEmail('user@test.com', 'Alice');
      expect(mockAdd).toHaveBeenCalled();
      expect(mockAdd.mock.calls[0][1].priority).toBe(5);
    });
  });

  describe('Queue Utils', () => {
    beforeEach(async () => {
      emailQueueModule.createEmailQueue();
      await Promise.resolve();
    });

    it('isQueueAvailable should return true when ready', () => {
      expect(emailQueueModule.isQueueAvailable()).toBe(true);
    });

    it('getQueueStats should return formatted counts', async () => {
      const stats = await emailQueueModule.getQueueStats();
      expect(stats.total).toBe(6);
      expect(stats.available).toBe(true);
    });

    it('cleanOldJobs should call queue clean methods', async () => {
      await emailQueueModule.cleanOldJobs();
      expect(mockQueue.clean).toHaveBeenCalledWith(86400000, 'completed');
    });
  });
});
