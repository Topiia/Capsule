/* eslint-disable global-require, no-unused-vars, prefer-destructuring */

// ─── All mocks must be declared BEFORE any require of production code ───────
jest.mock('bull');
jest.mock('../../src/config/logger');
jest.mock('../../src/config/email', () => ({
  redis: { host: 'localhost', port: 6379 },
  resend: {
    apiKey: 'test-key',
    fromEmail: 'test@test.com',
    fromName: 'Test',
  },
  validateEmailConfig: jest.fn().mockReturnValue(true),
}));
jest.mock('../../src/utils/sendEmailSync', () => ({
  sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-email-id' }),
}));

// ─── Require mocked modules AFTER jest.mock() calls ─────────────────────────
const Queue = require('bull');
const logger = require('../../src/config/logger');
const { sendEmailSync } = require('../../src/utils/sendEmailSync');
const { createEmailQueue, queueEmail } = require('../../src/queues/emailQueue');

describe('Email Queue - Graceful Degradation', () => {
  let mockQueue;
  let mockAdd;
  let mockIsReady;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'development';

    mockAdd = jest.fn();
    mockIsReady = jest.fn();

    mockQueue = {
      add: mockAdd,
      isReady: mockIsReady,
      // Required by queueEmail(): proactive Redis + worker health check
      client: {
        status: 'ready',
        get: jest.fn().mockResolvedValue(String(Date.now())), // fresh heartbeat
        set: jest.fn(),
        on: jest.fn(),
      },
    };

    Queue.mockImplementation(() => mockQueue);
  });

  describe('When Redis is UP', () => {
    beforeEach(async () => {
      mockIsReady.mockResolvedValue(true);
      mockAdd.mockResolvedValue({ id: 'job-123' });

      createEmailQueue();
      // Wait for async queueReady microtask to flush
      await Promise.resolve();
    });

    it('should queue email asynchronously', async () => {
      const result = await queueEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result).toEqual({ jobId: 'job-123', queued: true });
      expect(mockAdd).toHaveBeenCalled();
      expect(sendEmailSync).not.toHaveBeenCalled();
    });
  });

  describe('When Redis is DOWN', () => {
    beforeEach(async () => {
      // Return a rejected promise for the mock
      mockIsReady.mockRejectedValue(new Error('Redis unavailable'));
      mockAdd.mockRejectedValue(new Error('Redis connection failed'));

      // We must reset the internal queue module state to test failure after success
      // In tests, we reset the node module cache to get fresh queueReady logic
      jest.resetModules();

      // Re-apply mocks internally for the isolated require
      jest.mock('bull');
      jest.mock('../../src/config/logger');
      jest.mock('../../src/config/email', () => ({
        redis: { host: 'localhost', port: 6379 },
        resend: { apiKey: 'test-key', fromEmail: 'test@test.com', fromName: 'Test' },
        validateEmailConfig: jest.fn().mockReturnValue(true),
      }));
      jest.mock('../../src/utils/sendEmailSync', () => ({
        sendEmailSync: jest.fn().mockResolvedValue({ id: 'sync-email-id' }),
      }));

      const QueueFresh = require('bull');
      QueueFresh.mockImplementation(() => ({
        add: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
        isReady: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
        // client.status !== 'ready' → redisReady=false → sync-fallback immediately
        client: {
          status: 'connecting',
          get: jest.fn(),
          set: jest.fn(),
          on: jest.fn(),
        },
      }));

      const { createEmailQueue: freshCreate } = require('../../src/queues/emailQueue');
      freshCreate();
      // Wait for rejected promise microtask to flush
      await Promise.resolve();
    });

    it('should fallback to synchronous email sending', async () => {
      const { queueEmail: freshQueueEmail } = require('../../src/queues/emailQueue');
      const freshLogger = require('../../src/config/logger');
      const { sendEmailSync: freshSendSync } = require('../../src/utils/sendEmailSync');

      const emailData = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      };

      const result = await freshQueueEmail(emailData);

      // Fire-and-forget: returns immediately without awaiting sendEmailSync.
      // emailId is null because we don't await the result; email sends in background.
      expect(result).toEqual({ emailId: null, fallback: true, fireAndForget: true });

      expect(freshSendSync).toHaveBeenCalledWith(emailData);
      expect(freshLogger.warn).toHaveBeenCalledWith(
        'Email sync-fallback selected',
        expect.objectContaining({
          to: emailData.to,
          subject: emailData.subject,
        }),
      );
    });

    it('should NOT crash the application', async () => {
      const { queueEmail: freshQueueEmail } = require('../../src/queues/emailQueue');

      // Should not throw
      await expect(freshQueueEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      })).resolves.toBeDefined();
    });
  });
});
