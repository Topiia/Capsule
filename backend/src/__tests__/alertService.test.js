/**
 * alertService.test.js — Unit tests for the Sentry-based CSP alert service.
 *
 * Mocks @sentry/node so no real Sentry events are fired during testing.
 */

// Mock Sentry before requiring alertService
jest.mock('@sentry/node', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

// Mock resend (already mocked elsewhere in the suite)
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: jest.fn().mockResolvedValue({ id: 'mock-id' }),
    },
  })),
}));

const Sentry = require('@sentry/node');
const AlertService = require('../services/alertService');

describe('AlertService', () => {
  let service;
  let consoleSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Construct with explicit thresholds to keep tests deterministic
    service = new AlertService({ warningThreshold: 100, criticalThreshold: 500 });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  // ── Tier 1: below warning threshold ──────────────────────────────────────

  test('logs to console and skips Sentry when count is below warning threshold', async () => {
    await service.notify({
      blockedUri: 'https://test.com',
      violatedDirective: 'script-src',
      totalViolations: 50,
    });

    expect(consoleSpy).toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('logs to console for count of exactly 0', async () => {
    await service.notify({
      blockedUri: 'https://test.com',
      violatedDirective: 'img-src',
      totalViolations: 0,
    });

    expect(consoleSpy).toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  // ── Tier 2: at warning threshold ─────────────────────────────────────────

  test('sends Sentry warning when count equals warning threshold', async () => {
    await service.notify({
      blockedUri: 'https://test.com',
      violatedDirective: 'script-src',
      totalViolations: 100,
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('CSP Warning'),
      expect.objectContaining({ level: 'warning' }),
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('sends Sentry warning for counts between thresholds', async () => {
    await service.notify({
      blockedUri: 'https://analytics.com',
      violatedDirective: 'connect-src',
      totalViolations: 300,
    });

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining('analytics.com'),
      expect.objectContaining({
        level: 'warning',
        tags: expect.objectContaining({ type: 'csp-violation' }),
      }),
    );
  });

  // ── Tier 3: at critical threshold ────────────────────────────────────────

  test('sends Sentry exception when count meets critical threshold', async () => {
    await service.notify({
      blockedUri: 'https://evil.com',
      violatedDirective: 'script-src',
      totalViolations: 500,
    });

    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ type: 'csp-violation' }),
      }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  test('sends Sentry exception for counts above critical threshold', async () => {
    await service.notify({
      blockedUri: 'https://evil.com',
      violatedDirective: 'object-src',
      totalViolations: 1000,
    });

    expect(Sentry.captureException).toHaveBeenCalled();
  });

  // ── Constructor defaults ──────────────────────────────────────────────────

  test('uses environment variable thresholds when no config is passed', () => {
    const originalAlertThreshold = process.env.ALERT_THRESHOLD;
    const originalCriticalThreshold = process.env.CRITICAL_THRESHOLD;

    process.env.ALERT_THRESHOLD = '200';
    process.env.CRITICAL_THRESHOLD = '1000';

    const defaultService = new AlertService();
    expect(defaultService.warningThreshold).toBe(200);
    expect(defaultService.criticalThreshold).toBe(1000);

    // Restore
    process.env.ALERT_THRESHOLD = originalAlertThreshold;
    process.env.CRITICAL_THRESHOLD = originalCriticalThreshold;
  });

  test('falls back to hardcoded defaults when no env or config provided', () => {
    const originalAlertThreshold = process.env.ALERT_THRESHOLD;
    const originalCriticalThreshold = process.env.CRITICAL_THRESHOLD;

    delete process.env.ALERT_THRESHOLD;
    delete process.env.CRITICAL_THRESHOLD;

    const defaultService = new AlertService();
    expect(defaultService.warningThreshold).toBe(100);
    expect(defaultService.criticalThreshold).toBe(500);

    // Restore
    process.env.ALERT_THRESHOLD = originalAlertThreshold;
    process.env.CRITICAL_THRESHOLD = originalCriticalThreshold;
  });
});
