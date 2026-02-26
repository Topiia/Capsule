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
    // Required by instrumentation: startWorker() calls emailQueue.isReady()
    // to attach the QUEUE_READY / REDIS_STATUS_START / QUEUE_STATS probes.
    isReady: jest.fn().mockResolvedValue(true),
    // Required by instrumentation: called inside isReady().then() for QUEUE_STATS,
    // and at JOB_RECEIVED for QUEUE_DEPTH.
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    // Required by instrumentation: getRedisStatus() reads emailQueue.client.status
    client: { status: 'ready' },
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
  global.__workerSignalsAttached = false;
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
      // Switch to real timers for this describe only — the QUEUE_DEPTH probe
      // has multiple nested async awaits (Promise.all in a try block) that
      // cannot be drained reliably under fake timers.
      jest.useRealTimers();
      startWorker();
      [jobProcessor] = mockProcess.mock.calls[0];
    });

    afterEach(() => {
      // Restore fake timers for other describe blocks
      jest.useFakeTimers();
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

      // Never-resolving promise — forces the 10s Resend timeout to fire
      mockEmailSend.mockImplementation(() => new Promise(() => {}));

      await expect(jobProcessor(mockJob)).rejects.toThrow('Resend API timeout');
    }, 15000);

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

      // Resolves immediately — well within the 10s timeout
      mockEmailSend.mockResolvedValue({ id: 'fast-msg' });

      await expect(jobProcessor(mockJob)).resolves.toEqual({ success: true });
    }, 15000);
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
