import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import type { MaasPlan, MaasSubscription } from '../../../shared/auth/maasSubscriptions';
import { MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';
import { filterPlansByPeriod, formatPlanDuration, formatPlanPrice, PlatformPlanPeriod, subscriptionStatusKey } from './platformAccountPresentation';
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

  test('renders public plan and subscription fields without quota or reset values', () => {
    const markup = renderToStaticMarkup(createElement(PlatformPlanCard, { plan, subscribed: true, locale: 'en-US' }))
      + renderToStaticMarkup(createElement(PlatformSubscriptionCard, { subscription, plan, locale: 'en-US' }));
    expect(markup).toContain('Workspace plan');
    expect(markup).toContain('19.50');
    expect(markup).toContain('CNY');
    for (const hidden of ['987654321', '987,654,321', '123456789', '123,456,789', '1900000000']) expect(markup).not.toContain(hidden);
    expect(markup).not.toMatch(/quota|allowance|积分/i);
    expect(markup).toContain('disabled=""');
  });

  test('keeps a subscription visible when its plan is no longer in the catalog', () => {
    const markup = renderToStaticMarkup(createElement(PlatformSubscriptionCard, { subscription: { ...subscription, planId: 99, status: MaasSubscriptionStatus.Cancelled }, locale: 'en-US' }));
    expect(markup).toContain('99');
    expect(markup).not.toContain('data-active');
  });
});
