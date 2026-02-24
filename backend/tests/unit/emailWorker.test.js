/* eslint-disable global-require, prefer-destructuring, no-promise-executor-return */

// ─── All mocks must be declared BEFORE any require of production code ───────
jest.mock('bull');
jest.mock('resend');
jest.mock('../../src/config/logger');
jest.mock('../../src/config/email', () => ({
  resend: {
    apiKey: 'test-api-key',
    fromEmail: 'noreply@testdomain.com',
    fromName: 'VlogSphere Test',
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,
  },
}));

// ─── Require mocked modules AFTER jest.mock() calls ─────────────────────────
const Queue = require('bull');
const { Resend } = require('resend');
const logger = require('../../src/config/logger');
const { startWorker } = require('../../src/workers/emailWorker');

// ─── Shared mock instances set up in beforeEach ──────────────────────────────
let mockQueue;
let mockProcess;
let mockOn;
let mockEmailSend;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();

  // Set up Bull mock
  mockProcess = jest.fn();
  mockOn = jest.fn();
  mockQueue = {
    process: mockProcess,
    on: mockOn,
    close: jest.fn().mockResolvedValue(true),
  };
  Queue.mockImplementation(() => mockQueue);

  // Set up Resend mock
  mockEmailSend = jest.fn();
  Resend.mockImplementation(() => ({
    emails: { send: mockEmailSend },
  }));
});

afterEach(() => {
  jest.useRealTimers();
  // Remove signal listeners added by startWorker to prevent leaks between tests
  process.removeAllListeners('SIGTERM');
  process.removeAllListeners('SIGINT');
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Email Worker', () => {
  describe('Worker Initialization', () => {
    it('should initialize Bull queue consumer with correct config', () => {
      startWorker();

      expect(Queue).toHaveBeenCalledWith('email', {
        redis: {
          host: 'localhost',
          port: 6379,
          password: undefined,
        },
      });
    });

    it('should register job processor', () => {
      startWorker();

      expect(mockProcess).toHaveBeenCalled();
      expect(typeof mockProcess.mock.calls[0][0]).toBe('function');
    });

    it('should register event handlers for completed and failed', () => {
      startWorker();

      const eventNames = mockOn.mock.calls.map((call) => call[0]);
      expect(eventNames).toContain('completed');
      expect(eventNames).toContain('failed');
    });
  });

  describe('Job Processing Logic', () => {
    let jobProcessor;

    beforeEach(() => {
      startWorker();
      [jobProcessor] = mockProcess.mock.calls[0];
    });

    it('should call sendEmail with correct arguments', async () => {
      const mockJob = {
        id: 'job-123',
        data: {
          to: 'user@example.com',
          subject: 'Test Email',
          html: '<h1>Test</h1>',
          text: 'Test',
        },
        attemptsMade: 0,
      };

      mockEmailSend.mockResolvedValue({ id: 'resend-msg-123' });

      await jobProcessor(mockJob);

      expect(mockEmailSend).toHaveBeenCalledWith({
        from: 'VlogSphere Test <noreply@testdomain.com>',
        to: 'user@example.com',
        subject: 'Test Email',
        html: '<h1>Test</h1>',
        text: 'Test',
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Email sent via Resend',
        expect.objectContaining({
          emailId: 'resend-msg-123',
          to: 'user@example.com',
        }),
      );
    });

    it('should return success object on successful send', async () => {
      const mockJob = {
        id: 'job-456',
        data: {
          to: 'user@example.com',
          subject: 'Test',
          html: '<h1>Test</h1>',
          text: 'Test',
        },
        attemptsMade: 0,
      };

      mockEmailSend.mockResolvedValue({ id: 'msg-456' });

      const result = await jobProcessor(mockJob);

      expect(result).toEqual({ success: true });
    });
  });

  describe('Timeout Logic', () => {
    let jobProcessor;

    beforeEach(() => {
      startWorker();
      [jobProcessor] = mockProcess.mock.calls[0];
    });

    it('should timeout after 10 seconds if Resend API is slow', async () => {
      const mockJob = {
        id: 'job-timeout',
        data: {
          to: 'user@example.com',
          subject: 'Slow Email',
          html: '<h1>Slow</h1>',
          text: 'Slow',
        },
        attemptsMade: 1,
      };

      mockEmailSend.mockImplementation(
        () => new Promise((resolve) => {
          setTimeout(() => resolve({ id: 'late-msg' }), 15000);
        }),
      );

      const jobPromise = jobProcessor(mockJob);
      jest.advanceTimersByTime(10000);

      await expect(jobPromise).rejects.toThrow('Resend API timeout');
    });

    it('should succeed if Resend responds within timeout', async () => {
      const mockJob = {
        id: 'job-fast',
        data: {
          to: 'user@example.com',
          subject: 'Fast Email',
          html: '<h1>Fast</h1>',
          text: 'Fast',
        },
        attemptsMade: 0,
      };

      mockEmailSend.mockImplementation(
        () => new Promise((resolve) => {
          setTimeout(() => resolve({ id: 'fast-msg' }), 1000);
        }),
      );

      const jobPromise = jobProcessor(mockJob);
      jest.advanceTimersByTime(1000);

      await expect(jobPromise).resolves.toEqual({ success: true });
    });
  });

  describe('Error Handling and Retries', () => {
    let jobProcessor;

    beforeEach(() => {
      startWorker();
      [jobProcessor] = mockProcess.mock.calls[0];
    });

    it('should throw error on send failure (trigger Bull retry)', async () => {
      const mockJob = {
        id: 'job-fail',
        data: {
          to: 'user@example.com',
          subject: 'Failing Email',
          html: '<h1>Fail</h1>',
          text: 'Fail',
        },
        attemptsMade: 1,
      };

      mockEmailSend.mockRejectedValue(new Error('Resend API error'));

      await expect(jobProcessor(mockJob)).rejects.toThrow('Resend API error');

      expect(logger.error).toHaveBeenCalledWith(
        'Email send failed',
        expect.objectContaining({
          jobId: 'job-fail',
          error: 'Resend API error',
          attempt: 2,
        }),
      );
    });

    it('should log attempt number on each retry', async () => {
      const mockJob = {
        id: 'job-retry',
        data: {
          to: 'user@example.com',
          subject: 'Retry Email',
          html: '<h1>Retry</h1>',
          text: 'Retry',
        },
        attemptsMade: 2,
      };

      mockEmailSend.mockResolvedValue({ id: 'retry-msg' });

      await jobProcessor(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing email job',
        expect.objectContaining({ attempt: 3 }),
      );
    });
  });

  describe('Event Handlers', () => {
    let completedHandler;
    let failedHandler;

    beforeEach(() => {
      startWorker();

      const completedCall = mockOn.mock.calls.find((c) => c[0] === 'completed');
      const failedCall = mockOn.mock.calls.find((c) => c[0] === 'failed');

      completedHandler = completedCall ? completedCall[1] : null;
      failedHandler = failedCall ? failedCall[1] : null;
    });

    it('should log completion event', () => {
      const mockJob = { id: 'job-complete' };
      completedHandler(mockJob);

      expect(logger.debug).toHaveBeenCalledWith(
        'Email delivered',
        { jobId: 'job-complete' },
      );
    });

    it('should log failure event after max retries', () => {
      const mockJob = {
        id: 'job-failed',
        data: { to: 'user@example.com' },
        attemptsMade: 3,
      };
      const mockError = new Error('Max retries exceeded');
      failedHandler(mockJob, mockError);

      expect(logger.error).toHaveBeenCalledWith(
        'Email failed permanently',
        expect.objectContaining({
          jobId: 'job-failed',
          to: 'user@example.com',
          error: 'Max retries exceeded',
          attempts: 3,
        }),
      );
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close queue on SIGTERM', async () => {
      startWorker();
      process.emit('SIGTERM');

      await Promise.resolve(); // allow microtasks to flush

      expect(mockQueue.close).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Shutting down email worker...');
    });

    it('should close queue on SIGINT', async () => {
      startWorker();
      process.emit('SIGINT');

      await Promise.resolve(); // allow microtasks to flush

      expect(mockQueue.close).toHaveBeenCalled();
    });
  });
});
