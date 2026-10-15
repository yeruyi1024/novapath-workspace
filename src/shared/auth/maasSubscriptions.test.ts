import { describe, expect, test } from 'vitest';

import { parseMaasSubscriptions } from './maasSubscriptions';

const plans = [{ plan: { id: 2, title: '平台月包', subtitle: '描述', price_amount: 9.9, currency: 'CNY', duration_unit: 'month', duration_value: 1, total_amount: 500000, quota_reset_period: 'daily', stripe_price_id: 'private-reference' } }];
const sub = { id: 7, user_id: 12, plan_id: 2, status: 'active', start_time: 1, end_time: 2000000000, amount_total: 500000, amount_used: 1234 };
const self = { billing_preference: 'subscription_first', subscriptions: [{ subscription: sub }] };

describe('platform subscription projection', () => {
  test('projects public data, supports active-only older responses, and excludes payment metadata', () => {
    const result = parseMaasSubscriptions(plans, self, 12, 'https://fixture.example');
    expect(result.plans[0]).toMatchObject({ title: '平台月包', price: 9.9 });
    expect(result.subscriptions[0]).toMatchObject({ id: 7, amountUsed: 1234 });
    expect(JSON.stringify(result)).not.toContain('private-reference');
  });
  test('keeps expired/cancelled history and zero unlimited allowance', () => {
    const result = parseMaasSubscriptions([], { ...self, all_subscriptions: [{ subscription: { ...sub, status: 'expired', amount_total: 0 } }] }, 12, 'https://fixture.example');
    expect(result.subscriptions[0]).toMatchObject({ status: 'expired', amountTotal: 0 });
  });
  test('supports no plans and no subscriptions', () => {
    expect(parseMaasSubscriptions([], { ...self, subscriptions: [] }, 12, 'https://fixture.example').subscriptions).toEqual([]);
  });
  test('rejects subscriptions belonging to another account', () => {
    expect(() => parseMaasSubscriptions(plans, { ...self, subscriptions: [{ subscription: { ...sub, user_id: 13 } }] }, 12, 'https://fixture.example')).toThrow('invalidResponse');
  });
  test.each([NaN, -1, Infinity, '1000', Number.MAX_SAFE_INTEGER + 1])('rejects invalid allowance %s', amount => {
    expect(() => parseMaasSubscriptions(plans, { ...self, subscriptions: [{ subscription: { ...sub, amount_total: amount } }] }, 12, 'https://fixture.example')).toThrow('invalidResponse');
  });
  test('rejects malformed envelopes instead of silently showing no subscriptions', () => {
    expect(() => parseMaasSubscriptions(null, self, 12, 'https://fixture.example')).toThrow();
    expect(() => parseMaasSubscriptions(plans, {}, 12, 'https://fixture.example')).toThrow();
  });
});
