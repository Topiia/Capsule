/* eslint-disable global-require, prefer-destructuring, no-promise-executor-return */

jest.mock('../../src/models/EmailJob', () => ({
  create: jest.fn().mockImplementation((data) => Promise.resolve({
    ...data,
    _id: 'dbjob-123',
    maxAttempts: data.critical ? 5 : 3,
  })),
  updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/monitoring/dlqMonitor', () => ({
  onJobFailed: jest.fn(),
  createFailureSpikeDetector: jest.fn(),
}));
jest.mock('../../src/config/systemState', () => ({
  set: jest.fn(),
  get: jest.fn(),
}));

jest.mock('../../src/config/metrics', () => ({
  increment: jest.fn(),
  gauge: jest.fn(),
}));

jest.mock('../../src/config/queue.config', () => ({
  createQueue: jest.fn(),
}));

const {
  createEmailQueue, queueEmail, queueVerificationEmail, queuePasswordResetEmail, queueWelcomeEmail, getQueueStats,
} = require('../../src/queues/emailQueue');
const { createQueue } = require('../../src/config/queue.config');
const EmailJob = require('../../src/models/EmailJob');

describe('Email Queue Producer (Outbox Architecture)', () => {
  let mockQueue;
  let mockAdd;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAdd = jest.fn().mockResolvedValue({ id: 'bull-msg-123' });
    mockQueue = {
      add: mockAdd,
      isReady: jest.fn().mockResolvedValue(true),
      getWaitingCount: jest.fn().mockResolvedValue(1),
      getActiveCount: jest.fn().mockResolvedValue(2),
      getCompletedCount: jest.fn().mockResolvedValue(3),
      getFailedCount: jest.fn().mockResolvedValue(4),
      getDelayedCount: jest.fn().mockResolvedValue(5),
      clean: jest.fn(),
      close: jest.fn(),
    };

    createQueue.mockReturnValue(mockQueue);
    // Bind mock queue locally
    createEmailQueue();

    // Clear the microtask queue to ensure queueReady = true finishes internally
    await Promise.resolve();
    await Promise.resolve();
    await new Promise(process.nextTick);
  });

  describe('queueEmail() - Success Path', () => {
    it('should create an EmailJob in MongoDB and push to Bull Queue', async () => {
      const emailData = {
        to: 'user@example.com', subject: 'Test', html: '<p>Test</p>', text: 'Test', type: 'marketing',
      };
      const context = { traceId: 'trace-123', userId: 'user-456' };

      const result = await queueEmail(emailData, 7, context);

      expect(EmailJob.create).toHaveBeenCalledWith(expect.objectContaining({
        email: 'user@example.com',
        type: 'marketing',
        status: 'PENDING',
        traceId: 'trace-123',
        userId: 'user-456',
      }));

      expect(mockAdd).toHaveBeenCalledWith(
        { emailJobId: 'dbjob-123' },
        { priority: 7, attempts: 3 },
      );

      expect(EmailJob.updateOne).toHaveBeenCalledWith(
        { _id: 'dbjob-123' },
        { $set: expect.objectContaining({ status: 'QUEUED' }) },
      );

      expect(result).toEqual({ emailJobId: 'dbjob-123', queued: true });
    });
  });

  describe('queueEmail() - Bull Failure Path (Self-Healing Enqueue)', () => {
    it('should catch Bull errors and leave EmailJob as PENDING for the dispatcher', async () => {
      const q = createEmailQueue();
      q.add.mockRejectedValueOnce(new Error('Redis unavailable'));

      const result = await queueEmail({ to: 'user@example.com', type: 'marketing' }, 5, {});

      expect(EmailJob.create).toHaveBeenCalled();
      expect(EmailJob.updateOne).not.toHaveBeenCalled();
      expect(result).toEqual({ emailJobId: 'dbjob-123', queued: false });
    });
  });

  describe('Convenience Wrappers', () => {
    it('queueVerificationEmail sets critical priority and attributes', async () => {
      await queueVerificationEmail('test@example.com', 'http://url');
      expect(EmailJob.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'verification' }));
    });

    it('queuePasswordResetEmail sets critical priority and attributes', async () => {
      await queuePasswordResetEmail('test@example.com', 'http://url');
      expect(EmailJob.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'forgot_password' }));
    });

    it('queueWelcomeEmail creates general email', async () => {
      await queueWelcomeEmail('test@example.com', 'Bob');
      expect(EmailJob.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'general' }));
    });
  });

  describe('Utilities', () => {
    it('returns queue stats', async () => {
      const stats = await getQueueStats();
      expect(stats.waiting).toBe(1);
    });
  });
});
