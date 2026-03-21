/* eslint-disable global-require, prefer-destructuring */

// MOCK DEPENDENCIES
jest.mock('resend');
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
jest.mock('../../src/instrumentation/sentry', () => ({
  captureException: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
}));

// Strictly mock EmailJob models BEFORE imports
jest.mock('../../src/models/EmailJob', () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
  findById: jest.fn(),
}));

// Prevent genuine Bull Queue connections
jest.mock('../../src/config/queue.config', () => ({
  createQueue: jest.fn(),
}));

const { Resend } = require('resend');
const { createQueue } = require('../../src/config/queue.config');
const EmailJob = require('../../src/models/EmailJob');
const { startWorker } = require('../../src/workers/emailWorker');

describe('Email Worker Process Architecture', () => {
  let mockQueue;
  let mockProcess;
  let mockEmailSend;
  let jobProcessor;

  beforeAll(() => {
    // Completely disable background processes & fake timers
    // Fake timers cause hanging if setIntervals are active globally
    // We test logic directly via isolated mocked function extraction
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockProcess = jest.fn();
    mockQueue = {
      process: mockProcess,
      on: jest.fn(),
      isReady: jest.fn().mockResolvedValue(true),
      close: jest.fn().mockResolvedValue(true),
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getDelayedCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(0),
      getFailedCount: jest.fn().mockResolvedValue(0),
    };
    createQueue.mockReturnValue(mockQueue);

    mockEmailSend = jest.fn().mockResolvedValue({ id: 'resend-msg-123' });
    Resend.mockImplementation(() => ({
      emails: { send: mockEmailSend },
    }));

    // Start the worker to bind handlers, but since queue is blocked, no genuine IO happens
    startWorker();

    // Extract the processor closure (arg 1, because arg 0 is concurrency limit 10)
    jobProcessor = mockProcess.mock.calls[0][1];
  });

  afterEach(() => {
    // Trigger the interval clearance so node can exit
    process.emit('SIGTERM_HEARTBEAT_CLEANUP');

    // Remove listeners preventing jest from closing cleanly
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM_HEARTBEAT_CLEANUP');
    global.__workerSignalsAttached = false;
  });

  describe('jobProcessor (Outbox Execution Flow)', () => {
    it('aborts legacy jobs seamlessly if emailJobId is missing', async () => {
      const legacyJob = { id: 'bull-1', data: { to: 'test@example.com' } };
      await expect(jobProcessor(legacyJob)).rejects.toThrow('Legacy direct job without emailJobId detected');
    });

    it('bails quietly if EmailJob cannot acquire Mongoose lock (duplicate claim)', async () => {
      const duplicateJob = { id: 'bull-2', data: { emailJobId: 'db-123' } };
      EmailJob.findOneAndUpdate.mockResolvedValue(null); // Lock denied

      const result = await jobProcessor(duplicateJob);
      expect(result).toEqual({ success: true, duplicate: true });
      expect(mockEmailSend).not.toHaveBeenCalled();
    });

    it('completes the full flow: lock -> send -> final state transition (SENT)', async () => {
      const validJob = { id: 'bull-3', data: { emailJobId: 'db-123' } };
      EmailJob.findOneAndUpdate.mockResolvedValue({
        _id: 'db-123',
        email: 'test@example.com',
        payload: { subject: 'Test', html: '<p>Hi</p>', text: 'Hi' },
        traceId: 'trc-1',
        type: 'general',
      });

      const result = await jobProcessor(validJob);

      expect(mockEmailSend).toHaveBeenCalledWith(expect.objectContaining({
        to: 'test@example.com',
        subject: 'Test',
        headers: { 'X-Entity-Ref-ID': 'db-123' },
      }));

      expect(EmailJob.updateOne).toHaveBeenCalledWith(
        { _id: 'db-123' },
        { $set: { status: 'SENT', providerMessageId: 'resend-msg-123' } },
      );

      expect(result).toEqual({ success: true });
    });

    it('handles failures: transition to FAILED and increments attempts safely', async () => {
      const failedJob = { id: 'bull-4', data: { emailJobId: 'db-123' } };

      EmailJob.findOneAndUpdate.mockResolvedValue({
        _id: 'db-123',
        email: 'test@example.com',
        payload: { subject: 'Test' },
      });

      mockEmailSend.mockRejectedValue(new Error('Resend Down'));

      EmailJob.findById.mockResolvedValue({ attempts: 1, maxAttempts: 5 });

      await expect(jobProcessor(failedJob)).rejects.toThrow('Resend Down');

      expect(EmailJob.updateOne).toHaveBeenCalledWith(
        { _id: 'db-123' },
        { $set: expect.objectContaining({ status: 'FAILED', attempts: 2 }) },
      );
    });

    it('handles permanent exhaustion: transition to DEAD', async () => {
      const failedJob = { id: 'bull-5', data: { emailJobId: 'db-123' } };

      EmailJob.findOneAndUpdate.mockResolvedValue({
        _id: 'db-123',
        email: 'test@example.com',
        payload: { subject: 'Test' },
      });

      mockEmailSend.mockRejectedValue(new Error('Resend Down Forever'));

      // Exhaust bounds
      EmailJob.findById.mockResolvedValue({ attempts: 4, maxAttempts: 5 });

      await expect(jobProcessor(failedJob)).rejects.toThrow('Resend Down Forever');

      expect(EmailJob.updateOne).toHaveBeenCalledWith(
        { _id: 'db-123' },
        { $set: expect.objectContaining({ status: 'DEAD', attempts: 5 }) },
      );
    });
  });
});
