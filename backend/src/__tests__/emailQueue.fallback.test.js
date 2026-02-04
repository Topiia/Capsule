/* eslint-disable global-require */
const { queueEmail } = require('../queues/emailQueue');

// Mock dependencies
jest.mock('bull');
jest.mock('../config/logger');
jest.mock('../config/email');
jest.mock('../utils/sendEmailSync');

describe('Email Queue - Graceful Degradation', () => {
  let mockQueue;
  let mockLogger;
  let mockSendEmailSync;
  let emailConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    require('../config/logger');
    const logger = require('../config/logger');
    Object.assign(logger, mockLogger);

    // Mock email config
    emailConfig = {
      redis: { host: 'localhost', port: 6379 },
      resend: {
        apiKey: 'test-key',
        fromEmail: 'test@test.com',
        fromName: 'Test',
      },
      validateEmailConfig: jest.fn().mockReturnValue(true),
    };
    const emailConfigModule = require('../config/email');
    Object.assign(emailConfigModule, emailConfig);

    // Mock sendEmailSync
    mockSendEmailSync = jest.fn().mockResolvedValue({
      id: 'sync-email-id',
    });
    const sendEmailSyncModule = require('../utils/sendEmailSync');
    sendEmailSyncModule.sendEmailSync = mockSendEmailSync;
  });

  describe('When Redis is UP', () => {
    beforeEach(() => {
      mockQueue = {
        add: jest.fn().mockResolvedValue({ id: 'job-123' }),
        isReady: jest.fn().mockResolvedValue(true),
      };

      const Queue = require('bull');
      Queue.mockImplementation(() => mockQueue);
    });

    it('should queue email asynchronously', async () => {
      const { queueEmail: queueEmailFn } = require('../queues/emailQueue');

      // Wait for queue ready
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      const result = await queueEmailFn({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result).toEqual({ jobId: 'job-123', queued: true });
      expect(mockQueue.add).toHaveBeenCalled();
      expect(mockSendEmailSync).not.toHaveBeenCalled();
    });
  });

  describe('When Redis is DOWN', () => {
    beforeEach(() => {
      mockQueue = {
        add: jest.fn().mockRejectedValue(new Error('Redis connection failed')),
        isReady: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
      };

      const Queue = require('bull');
      Queue.mockImplementation(() => mockQueue);
    });

    it('should fallback to synchronous email sending', async () => {
      const { queueEmail: queueEmailFn } = require('../queues/emailQueue');

      // Wait for queue ready check to fail
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      const emailData = {
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      };

      const result = await queueEmailFn(emailData);

      expect(result).toEqual({ emailId: 'sync-email-id', fallback: true });
      expect(mockSendEmailSync).toHaveBeenCalledWith(emailData);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis unavailable - sending email synchronously (FALLBACK)',
        expect.objectContaining({
          to: emailData.to,
          subject: emailData.subject,
        }),
      );
    });

    it('should NOT crash the application', async () => {
      const { queueEmail: queueEmailFn } = require('../queues/emailQueue');

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      // Should not throw
      await expect(queueEmailFn({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: 'Test',
      })).resolves.toBeDefined();
    });
  });
});
