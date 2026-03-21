/* eslint-disable global-require */

/**
 * outboxDispatcher.test.js
 *
 * Tests the self-healing outbox sweep that recovers orphaned PENDING jobs.
 * We invoke `runDispatchCycle` directly — no setInterval, no fake timers,
 * no open handles.
 */

jest.mock('../../src/models/EmailJob', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
  updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
}));

jest.mock('../../src/config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock sendEmail utility — this is the direct-send fallback path
const mockSendEmail = jest.fn().mockResolvedValue({ data: { id: 'resend-msg-001' } });
jest.mock('../../src/utils/sendEmail', () => ({
  sendEmail: mockSendEmail,
}));

// Mock emailQueue module — returns a shared object so add() can be reassigned per test
const mockEmailQueue = { add: jest.fn() };
jest.mock('../../src/queues/emailQueue', () => ({
  createEmailQueue: jest.fn(() => mockEmailQueue),
}));

const {
  startOutboxDispatcher, stopOutboxDispatcher, runDispatchCycle,
} = require('../../src/workers/outboxDispatcher');

const EmailJob = require('../../src/models/EmailJob');

describe('OutboxDispatcher — poll cycle', () => {
  beforeEach(() => {
    // Reset per-test mocks manually
    mockEmailQueue.add = jest.fn().mockResolvedValue({ id: 'bull-999' });
    mockSendEmail.mockResolvedValue({ data: { id: 'resend-msg-001' } });
    // find() must return a chainable mock with .limit()
    EmailJob.find.mockReturnValue({ limit: jest.fn().mockResolvedValue([]) });
    EmailJob.findOneAndUpdate.mockReset();
    EmailJob.updateMany.mockResolvedValue({ modifiedCount: 0 });
    EmailJob.updateOne.mockResolvedValue({ modifiedCount: 1 });
    stopOutboxDispatcher();
    startOutboxDispatcher(); // Binds emailQueue inside the module
  });

  afterEach(() => {
    stopOutboxDispatcher();
  });

  it('atomically claims orphaned PENDING job and enqueues it into Bull', async () => {
    const fakeJob = {
      _id: 'job-orphan-1',
      status: 'PENDING',
      traceId: 'trace-abc',
      type: 'forgot_password',
      maxAttempts: 3,
      attempts: 0,
      email: 'user@example.com',
      payload: { subject: 'Reset', html: '<p>Reset</p>', text: 'Reset' },
    };
    EmailJob.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([fakeJob]) });
    EmailJob.findOneAndUpdate.mockResolvedValueOnce({ ...fakeJob, status: 'PROCESSING' });

    await runDispatchCycle();

    // Core assertion: PENDING guard must be in the atomic claim
    expect(EmailJob.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'job-orphan-1', status: 'PENDING' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'PROCESSING' }) }),
      { new: true },
    );
    // Bull should receive the job
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      { emailJobId: 'job-orphan-1' },
      expect.objectContaining({ priority: 5 }),
    );
    // Direct send should NOT be called when Bull succeeds
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('falls back to direct send when Bull is unavailable', async () => {
    const fakeJob = {
      _id: 'job-direct-1',
      status: 'PENDING',
      traceId: null,
      type: 'forgot_password',
      maxAttempts: 3,
      attempts: 0,
      email: 'user@example.com',
      payload: { subject: 'Reset Password', html: '<p>Reset</p>', text: 'Reset' },
    };
    EmailJob.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([fakeJob]) });
    EmailJob.findOneAndUpdate.mockResolvedValueOnce({ ...fakeJob, status: 'PROCESSING' });
    // Bull is unavailable
    mockEmailQueue.add.mockRejectedValueOnce(new Error('Redis ECONNREFUSED'));

    await runDispatchCycle();

    // Must fall back to direct send
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      subject: 'Reset Password',
    }));
    // DB must be marked SENT
    expect(EmailJob.updateOne).toHaveBeenCalledWith(
      { _id: 'job-direct-1' },
      { $set: { status: 'SENT', providerMessageId: 'resend-msg-001' } },
    );
  });

  it('marks job DEAD when max attempts exceeded and direct send fails', async () => {
    const fakeJob = {
      _id: 'job-dead-1',
      status: 'PENDING',
      traceId: null,
      type: 'forgot_password',
      maxAttempts: 3,
      attempts: 3, // Already at max
      email: 'user@example.com',
      payload: { subject: 'Reset', html: '<p>Reset</p>', text: 'Reset' },
    };
    EmailJob.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([fakeJob]) });
    EmailJob.findOneAndUpdate.mockResolvedValueOnce({ ...fakeJob, status: 'PROCESSING' });
    mockEmailQueue.add.mockRejectedValueOnce(new Error('Redis down'));
    mockSendEmail.mockRejectedValueOnce(new Error('Resend API key invalid'));

    await runDispatchCycle();

    expect(EmailJob.updateOne).toHaveBeenCalledWith(
      { _id: 'job-dead-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ status: 'DEAD' }),
      }),
    );
  });

  it('skips job when atomic claim returns null (race: already claimed)', async () => {
    const fakeJob = { _id: 'job-race-1', status: 'PENDING', maxAttempts: 3 };
    EmailJob.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([fakeJob]) });
    // Another dispatcher already claimed it
    EmailJob.findOneAndUpdate.mockResolvedValueOnce(null);

    await runDispatchCycle();

    // Neither Bull nor direct send should be called
    expect(mockEmailQueue.add).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
