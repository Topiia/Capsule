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

// Mock emailQueue module — the factory MUST return the same object reference
// so that setting `mockAdd` on it is visible inside the dispatcher module.
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
    // Reset per-test mocks manually (avoid jest.clearAllMocks wiping mockEmailQueue.add)
    mockEmailQueue.add = jest.fn().mockResolvedValue({ id: 'bull-999' });
    // find() must return a thenable-chainable mock with .limit() support
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
    };
    EmailJob.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([fakeJob]) });
    EmailJob.findOneAndUpdate.mockResolvedValueOnce({ ...fakeJob, status: 'QUEUED' });

    await runDispatchCycle();

    // Core assertion: PENDING guard must be in the atomic claim
    expect(EmailJob.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'job-orphan-1', status: 'PENDING' },
      { $set: { status: 'QUEUED', queuedAt: expect.any(Date) } },
      { new: true },
    );
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      { emailJobId: 'job-orphan-1' },
      expect.objectContaining({ priority: 5 }),
    );
  });

  it('reverts job to PENDING when Bull add() throws', async () => {
    const fakeJob = {
      _id: 'job-fail-1', status: 'PENDING', maxAttempts: 3, traceId: null,
    };
    EmailJob.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([fakeJob]) });
    EmailJob.findOneAndUpdate.mockResolvedValueOnce({ ...fakeJob, status: 'QUEUED' });
    mockEmailQueue.add.mockRejectedValueOnce(new Error('Redis down'));

    await runDispatchCycle();

    expect(EmailJob.updateOne).toHaveBeenCalledWith(
      { _id: 'job-fail-1' },
      { $set: { status: 'PENDING' }, $unset: { queuedAt: 1 } },
    );
  });

  it('skips job when atomic claim returns null (race: already claimed)', async () => {
    const fakeJob = { _id: 'job-race-1', status: 'PENDING', maxAttempts: 3 };
    EmailJob.find.mockReturnValueOnce({ limit: jest.fn().mockResolvedValue([fakeJob]) });
    EmailJob.findOneAndUpdate.mockResolvedValueOnce(null);

    await runDispatchCycle();

    expect(mockEmailQueue.add).not.toHaveBeenCalled();
  });
});
