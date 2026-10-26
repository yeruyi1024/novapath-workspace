import { describe, expect, test } from 'vitest';

import { formatMaasPoints, formatMaasQuota, maasQuotaToPoints, parseMaasBillingDisplay, parseMaasBillingSnapshot } from './maasBilling';

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


describe('points use the approved wallet-money ratio of 1:1000', () => {
  test('uses the platform display exchange rate, before money formatting rounds', () => {
    const cny = parseMaasBillingDisplay(status);
    expect(maasQuotaToPoints(500000, cny)).toBe(7000);
    expect(maasQuotaToPoints(500000, { ...cny, type: 'USD', exchangeRate: 1, symbol: '$' })).toBe(1000);
    expect(maasQuotaToPoints(0, cny)).toBe(0);
    expect(formatMaasPoints(maasQuotaToPoints(1, cny)!, 'en-US')).toBe('0.01');
    expect(formatMaasPoints(0.002, 'en-US')).toBe('<0.01');
    expect(formatMaasPoints(38250, 'en-US')).toBe('38,250');
  });

  test('does not multiply custom points or tokens again, or invent missing conversion', () => {
    const cny = parseMaasBillingDisplay(status);
    expect(maasQuotaToPoints(500000)).toBeNull();
    expect(maasQuotaToPoints(500000, { ...cny, type: 'CUSTOM', symbol: '积分' })).toBeNull();
    expect(maasQuotaToPoints(500000, { ...cny, type: 'TOKENS' })).toBeNull();
    expect(maasQuotaToPoints(500000, { ...cny, exchangeRate: 0 })).toBeNull();
    expect(maasQuotaToPoints(-1, cny)).toBeNull();
    expect(maasQuotaToPoints(Infinity, cny)).toBeNull();
  });
});
