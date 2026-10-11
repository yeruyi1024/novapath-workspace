import { afterEach, describe, expect, test, vi } from 'vitest';

import { MainLogReporter } from '../../main/libs/mainLogReporter';
import { isAnalyticsEndpointUrl } from '../../main/libs/sanitizeForLog';
import { LogReporterAction } from '../analytics/constants';
import { formatProductText,PRODUCT, PRODUCT_FEATURES, PRODUCT_SERVICES } from './index';

const originalFeatures = { ...PRODUCT_FEATURES };
const originalServices = { ...PRODUCT_SERVICES };
afterEach(() => {
  Object.assign(PRODUCT_FEATURES, originalFeatures);
  Object.assign(PRODUCT_SERVICES, originalServices);
});

describe('distribution privacy defaults', () => {
  test('ships without upstream service destinations or active commercial features', () => {
    expect(Object.values(PRODUCT_SERVICES).every(value => value === '')).toBe(true);
    expect(Object.values(PRODUCT_FEATURES).every(value => value === false)).toBe(true);
    expect(isAnalyticsEndpointUrl('')).toBe(false);
  });

  test('resolves every product placeholder', () => {
    expect(formatProductText('{productName} / {productName}')).toBe(`${PRODUCT.name} / ${PRODUCT.name}`);
  });

  test.each([undefined, false, true])('does not send telemetry with a legacy user preference of %s', async (preference) => {
    const fetch = vi.fn();
    const createInstallationId = vi.fn();
    const reporter = new MainLogReporter({
      appVersion: '1.0.0', fetch, createInstallationId,
      store: { get: <T>() => ({ usageAnalyticsEnabled: preference }) as T, set: vi.fn() },
    });
    expect(await reporter.report({ action: LogReporterAction.AppStarted })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(createInstallationId).not.toHaveBeenCalled();
  });

  test('still requires user opt-in when a collector is configured', async () => {
    PRODUCT_FEATURES.analytics = true;
    PRODUCT_SERVICES.analyticsUrl = 'https://metrics.example.com/events';
    const fetch = vi.fn();
    const reporter = new MainLogReporter({
      appVersion: '1.0.0', fetch,
      store: { get: <T>() => ({}) as T, set: vi.fn() },
    });
    expect(await reporter.report({ action: LogReporterAction.AppStarted })).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
