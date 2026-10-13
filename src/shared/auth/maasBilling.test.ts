import { describe, expect, test } from 'vitest';

import { formatMaasQuota, parseMaasBillingDisplay, parseMaasBillingSnapshot } from './maasBilling';

const status = { quota_display_type: 'CNY', quota_per_unit: 500000, usd_exchange_rate: 7, price: 1 };
const user = { id: 12, quota: 4285772, used_quota: 2953408, request_count: 612 };

describe('platform wallet conversion contract', () => {
  test('reconciles the provided wallet numbers using display exchange rate, not recharge price', () => {
    const billing = parseMaasBillingSnapshot({ ...user, access_token: 'secret' }, status, 12, 100);
    expect(formatMaasQuota(billing.quota, billing.display, 'zh-CN')).toBe('¥60');
    expect(formatMaasQuota(billing.usedQuota, billing.display, 'zh-CN')).toBe('¥41.35');
    expect(billing.requestCount).toBe(612);
    expect(billing.syncedAt).toBe(100);
    expect(JSON.stringify(billing)).not.toContain('secret');
  });

  test.each([
    [{ quota_display_type: 'USD', quota_per_unit: 1000 }, 1250, '$1.25'],
    [{ quota_display_type: 'TOKENS', quota_per_unit: 500000 }, 4285772, '4,285,772'],
    [{ quota_display_type: 'CUSTOM', quota_per_unit: '1000', custom_currency_symbol: '积分', custom_currency_exchange_rate: '100' }, 1250, '积分 125'],
    [{ display_in_currency: false, quota_per_unit: 500000 }, 612, '612'],
  ])('uses the configured units without inventing exchange rates', (config, quota, expected) => {
    expect(formatMaasQuota(quota, parseMaasBillingDisplay(config), 'en-US')).toBe(expected);
  });

  test('shows small non-zero consumption and negative balance consistently with platform currency formatting', () => {
    const display = parseMaasBillingDisplay(status);
    expect(formatMaasQuota(1, display, 'zh-CN')).toBe('¥0.0001');
    expect(formatMaasQuota(-500000, display, 'zh-CN')).toBe('-¥7');
    expect(formatMaasQuota(0, display, 'zh-CN')).toBe('¥0');
  });

  test.each([
    {}, { ...status, quota_per_unit: 0 }, { ...status, usd_exchange_rate: undefined },
    { ...status, usd_exchange_rate: Infinity }, { ...status, quota_display_type: 'EUR' },
    { ...status, quota_per_unit: 'NaN' },
  ])('rejects invalid display configuration', config => expect(() => parseMaasBillingDisplay(config)).toThrow('invalidResponse'));

  test.each([
    { ...user, id: 13 }, { ...user, request_count: undefined }, { ...user, request_count: -1 },
    { ...user, quota: Number.MAX_SAFE_INTEGER + 1 }, { ...user, used_quota: NaN },
  ])('rejects another account or malformed usage', data => expect(() => parseMaasBillingSnapshot(data, status, 12)).toThrow('invalidResponse'));
});
