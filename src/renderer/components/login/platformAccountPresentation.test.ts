import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import type { MaasPlan, MaasSubscription } from '../../../shared/auth/maasSubscriptions';
import { MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';
import { filterPlansByPeriod, formatPlanDuration, formatPlanPrice, formatPlanPriceLabel, formatSubscriptionDate, PlatformPlanPeriod, subscriptionStatusKey } from './platformAccountPresentation';
import { PlatformPlanCard, PlatformSubscriptionCard } from './PlatformPlanCard';

const plan: MaasPlan = { id: 7, title: 'Workspace plan', subtitle: 'Platform description', price: 19.5, currency: 'CNY', durationUnit: 'month', durationValue: 1, customSeconds: 0, totalAmount: 987654321, resetPeriod: 'daily', resetSeconds: 0 };
const subscription: MaasSubscription = { id: 8, planId: 7, status: MaasSubscriptionStatus.Active, startTime: 1760000000, endTime: 2000000000, amountTotal: 987654321, amountUsed: 123456789, nextResetTime: 1900000000 };

describe('platform plan presentation', () => {
  test('keeps custom and future periods in the complete catalog', () => {
    const plans = [plan, { ...plan, id: 9, durationUnit: 'custom', customSeconds: 90000 }, { ...plan, id: 10, durationUnit: 'future-period' }];
    expect(filterPlansByPeriod(plans, PlatformPlanPeriod.All)).toEqual(plans);
    expect(filterPlansByPeriod(plans, PlatformPlanPeriod.Month)).toEqual([plan]);
  });

  test('filters annual plans without converting their price or reordering the source', () => {
    const annual = { ...plan, id: 9, durationUnit: 'year', price: 399 };
    const plans = [plan, annual];
    expect(filterPlansByPeriod(plans, PlatformPlanPeriod.Year)).toEqual([annual]);
    expect(plans).toEqual([plan, annual]);
    expect(annual.price).toBe(399);
  });

  test('formats the platform price without changing the currency or assuming USD', () => {
    expect(formatPlanPrice(plan, 'zh-CN')).toBe('¥19.50');
    expect(formatPlanPrice({ price: 29, currency: 'USD' }, 'en-US')).toBe('$29');
    expect(formatPlanPrice({ price: 12.5, currency: 'non-standard' }, 'en-US')).toBe('12.5 non-standard');
    // decimal(10,6) quotes stay exact and a non-zero price never displays as zero.
    expect(formatPlanPrice({ price: 29.123456, currency: 'USD' }, 'en-US')).toBe('$29.123456');
    expect(formatPlanPrice({ price: 0.000001, currency: 'USD' }, 'en-US')).toBe('$0.000001');
    expect(formatPlanPrice({ price: 19.5, currency: 'CNY' }, 'zh-CN')).toBe('¥19.50');
  });

  test('does not assume a monthly duration for custom or unknown platform periods', () => {
    const t = (key: string) => ({ maasDuration_seconds: 'seconds', maasDuration_unspecified: 'See platform', maasDuration_month: 'months' }[key] ?? key);
    expect(formatPlanDuration(plan, 'en-US', t)).toBe('1 months');
    expect(formatPlanDuration({ ...plan, durationUnit: 'custom', customSeconds: 90000 }, 'en-US', t)).toBe('90,000 seconds');
    expect(formatPlanDuration({ ...plan, durationUnit: 'future-period' }, 'en-US', t)).toBe('See platform');
  });

  test('does not label unknown subscription states as active', () => {
    expect(subscriptionStatusKey(MaasSubscriptionStatus.Active)).toBe('maasSubscription_active');
    expect(subscriptionStatusKey(MaasSubscriptionStatus.Expired)).toBe('maasSubscription_expired');
    expect(subscriptionStatusKey('pending')).toBe('maasSubscription_unknown');
  });

  test('renders allowance, usage and reset information while requiring a purchase action', () => {
    const markup = renderToStaticMarkup(createElement(PlatformPlanCard, { plan, subscribed: true, locale: 'en-US' }))
      + renderToStaticMarkup(createElement(PlatformSubscriptionCard, { subscription, plan, locale: 'en-US' }));
    expect(markup).toContain('Workspace plan');
    expect(markup).toContain('19.50');
    expect(markup).toContain('CNY');
    expect(markup).toContain('987,654,321');
    expect(markup).toContain('123,456,789');
    expect(markup).toContain('platform-quota-track');
    expect(markup).not.toContain('1900000000');
    expect(markup).toContain('disabled=""');
  });

  test('keeps a subscription visible when its plan is no longer in the catalog', () => {
    const markup = renderToStaticMarkup(createElement(PlatformSubscriptionCard, { subscription: { ...subscription, planId: 99, status: MaasSubscriptionStatus.Cancelled }, locale: 'en-US' }));
    expect(markup).toContain('99');
    expect(markup).not.toContain('data-active');
  });
});


test('elapsed active records are displayed as expired, not as current subscriptions', () => {
  const markup = renderToStaticMarkup(createElement(PlatformSubscriptionCard, { subscription: { ...subscription, endTime: 2 }, locale: 'en-US', now: 3000 }));
  expect(markup).not.toContain('data-active');
});

test('unlimited subscriptions have no percentage bar or epoch reset date', () => {
  const markup = renderToStaticMarkup(createElement(PlatformSubscriptionCard, { subscription: { ...subscription, amountTotal: 0, nextResetTime: 0 }, locale: 'en-US' }));
  expect(markup).not.toContain('role="progressbar"');
  expect(markup).not.toContain('1970');
});


test('display conversion respects upstream currency modes without double converting native quotes', () => {
  const cny = { type: 'CNY' as const, quotaPerUnit: 500000, exchangeRate: 7, symbol: '¥' };
  expect(formatPlanPriceLabel({ price: 10, currency: 'USD' }, 'zh-CN', cny)).toBe('¥70 CNY');
  expect(formatPlanPriceLabel({ price: 10, currency: 'CNY' }, 'zh-CN', cny)).toBe('¥10 CNY');
  expect(formatPlanPriceLabel({ price: 10, currency: 'USD' }, 'en-US', { ...cny, type: 'USD', exchangeRate: 1, symbol: '$' })).toBe('$10 USD');
  expect(formatPlanPriceLabel({ price: 10, currency: 'USD' }, 'en-US', { ...cny, type: 'CUSTOM', exchangeRate: 100, symbol: '积分' })).toBe('积分 1,000');
  expect(formatPlanPriceLabel({ price: 10, currency: 'USD' }, 'en-US', { ...cny, type: 'TOKENS', exchangeRate: 1, symbol: '' })).toBe('$10 USD');
  expect(formatPlanPrice({ price: 0.000001, currency: 'USD' }, 'zh-CN', cny)).toBe('¥0.000007');
});


test('account dates use Beijing time across midnight without repeating a zone suffix', () => {
  const timestamp = Date.UTC(2026, 9, 23, 18, 5) / 1000;
  expect(formatSubscriptionDate(timestamp, 'zh-CN', key => key)).toBe('2026/10/24 02:05');
  expect(formatSubscriptionDate(timestamp, 'en-US', key => key)).toBe('10/24/2026, 02:05');
  expect(formatSubscriptionDate(0, 'zh-CN', key => key)).toBe('maasNotSpecified');
});
