import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { type MaasPlan, type MaasSubscriptions,MaasSubscriptionStatus } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import { filterPlansByPeriod, formatPlanMonthlyEquivalent, formatPlanPrice, formatSubscriptionDate, planPurchasePeriod,PlatformPlanPeriod } from './platformAccountPresentation';
import { PlatformPlanCard } from './PlatformPlanCard';
import PlatformSubscriptionOverview from './PlatformSubscriptionOverview';
import PlatformUsage from './PlatformUsage';

const plan: MaasPlan = { id: 135, title: 'Platform monthly offering', subtitle: 'Description supplied by the platform', price: 29, currency: 'USD', durationUnit: 'month', durationValue: 1, customSeconds: 0, totalAmount: 1200000, resetPeriod: 'never', resetSeconds: 0 };
const data: MaasSubscriptions = { accountId: 3, origin: 'https://platform.invalid', syncedAt: 10, billingPreference: 'subscription_first', plans: [plan],
  subscriptions: [{ id: 5, planId: plan.id, status: MaasSubscriptionStatus.Active, startTime: 10, endTime: 2000000000, amountTotal: 1200000, amountUsed: 200000, nextResetTime: 0 }],
  wallet: { accountId: 3, quota: 48500000, usedQuota: 1000000, requestCount: 12, syncedAt: 10, display: { type: 'USD', quotaPerUnit: 500000, exchangeRate: 1, symbol: '$' } } };

describe('monthly and annual product display', () => {
  test('offers explicit monthly and annual terms without renaming test days, custom periods, or quarters', () => {
    const annual = { ...plan, id: 202, durationUnit: 'year' };
    const twelveMonths = { ...plan, id: 303, durationValue: 12 };
    const others = [{ ...plan, id: 7, durationUnit: 'day' }, { ...plan, id: 8, durationUnit: 'custom', customSeconds: 31536000 }, { ...plan, id: 9, durationValue: 3 }];
    const plans = [...others, annual, plan, twelveMonths];
    expect(filterPlansByPeriod(plans, PlatformPlanPeriod.Month)).toEqual([plan]);
    expect(filterPlansByPeriod(plans, PlatformPlanPeriod.Year)).toEqual([annual, twelveMonths]);
    expect(others.every(item => planPurchasePeriod(item) === null)).toBe(true);
  });

  test('annual comparison respects currency precision and leaves the actual purchase amount unchanged', () => {
    const annual = Object.freeze({ ...plan, price: 299, durationUnit: 'year' });
    expect(formatPlanMonthlyEquivalent(annual, 'en-US')).toBe('$24.92');
    expect(formatPlanPrice(annual, 'en-US')).toBe('$299');
    expect(formatPlanMonthlyEquivalent({ price: 1000, currency: 'JPY' }, 'en-US')).toBe('¥83');
    expect(formatPlanMonthlyEquivalent({ price: 1, currency: 'KWD' }, 'en-US')).toContain('0.083');
    expect(annual.price).toBe(299);
    const html = renderToStaticMarkup(createElement(PlatformPlanCard, { plan: annual, subscribed: false, locale: 'en-US' }));
    expect(html).toContain('$24.92');
    expect(html).toContain('$299 USD');
    expect(html).toContain('data-actual-price="299"');
    expect(html).not.toContain('Business');
  });

  test('wallet plan prices follow the platform CNY display without changing settlement or annual terms', () => {
    const annual = Object.freeze({ ...plan, price: 299, durationUnit: 'year' });
    const display = { type: 'CNY' as const, quotaPerUnit: 500000, exchangeRate: 7, symbol: '¥' };
    const html = renderToStaticMarkup(createElement(PlatformPlanCard, { plan: annual, display, subscribed: false, locale: 'zh-CN' }));
    expect(html).toContain('¥174.42');
    expect(html).toContain('¥2,093 CNY');
    expect(html).not.toContain('USD');
    expect(html).not.toContain('$');
    expect(html).toContain('data-actual-price="299"');
    expect(annual.price).toBe(299);
  });

  test('annual monthly resets show monthly allowance without the retired design warning', () => {
    const html = renderToStaticMarkup(createElement(PlatformPlanCard, { plan: { ...plan, durationUnit: 'year', resetPeriod: 'monthly' }, subscribed: false, locale: 'en-US' }));
    expect(html).toContain(i18nService.t('accountMonthlyAllowance'));
    expect(html).toContain(i18nService.t('accountAnnualResetHint'));
    expect(html).not.toContain(i18nService.t('accountPlanResetConflict'));
  });

  test('a resetting product explains its actual schedule without internal design warnings', () => {
    const html = renderToStaticMarkup(createElement(PlatformPlanCard, { plan: { ...plan, resetPeriod: 'monthly' }, subscribed: false, locale: 'en-US' }));
    expect(html).toContain(i18nService.t('accountPlanResetConflict'));
    expect(html).toContain(i18nService.t('maasReset_monthly'));
    expect(html).not.toContain(i18nService.t('accountQuotaForValidity'));
  });
});

describe('usage and subscription selection are separate', () => {
  test('usage shows wallet and subscription facts independently and explains the missing consumption ledger', () => {
    const html = renderToStaticMarkup(createElement(PlatformUsage, { state: { data, loading: false }, locale: 'en-US', now: 50000 }));
    expect(html).toContain('<strong>$97</strong>');
    expect(html).toContain(`<dd>2,400 ${i18nService.t('authCreditsUnit')}</dd>`);
    expect(html).toContain('platform-quota-track');
    expect(html).toContain(i18nService.t('accountUsageScope'));
    expect(html).toContain(i18nService.t('accountConsumptionUnavailable'));
    expect(html).not.toContain('platform-plan-card');
    expect(html).not.toContain('<strong>$99</strong>');
  });

  test('subscription selection keeps non-monthly active and historical records without displaying consumption totals', () => {
    const day = { ...plan, id: 19, title: 'Existing daily subscription', durationUnit: 'day' };
    const history = { ...data.subscriptions[0], id: 8, planId: day.id, status: MaasSubscriptionStatus.Expired, endTime: 2 };
    const activeDay = { ...data.subscriptions[0], id: 9, planId: day.id };
    const html = renderToStaticMarkup(createElement(PlatformSubscriptionOverview, { data: { ...data, plans: [plan, day], subscriptions: [activeDay, history] }, locale: 'en-US', now: 50000 }));
    expect(html).toContain(day.title);
    expect(html).toContain(i18nService.t('accountOtherSubscriptions'));
    expect(html).not.toContain('platform-quota-track');
    expect(html).not.toContain('<strong>$97</strong>');
  });

  test('unknown wallet and subscription data is unavailable, rather than zero balance or no subscription', () => {
    const html = renderToStaticMarkup(createElement(PlatformUsage, { state: { data: { ...data, wallet: undefined, subscriptions: [], errors: { wallet: true, subscriptions: true } }, loading: false, error: 'network' }, locale: 'en-US', now: 50000 }));
    expect(html).toContain('—');
    expect(html).toContain(i18nService.t('maasSubscriptionSectionUnavailable'));
    expect(html).not.toContain(i18nService.t('accountNoCurrentSubscription'));
    expect(html).not.toContain('<strong>$0</strong>');
  });

  test('partial refresh failure shows the section last success rather than the latest overall sync', () => {
    const walletSync = Date.UTC(2026, 9, 21, 8);
    const latestSync = Date.UTC(2026, 9, 21, 9);
    const partial: MaasSubscriptions = { ...data, syncedAt: latestSync,
      sectionSyncedAt: { wallet: walletSync }, errors: { wallet: true, subscriptions: true } };
    const usage = renderToStaticMarkup(createElement(PlatformUsage, { state: { data: partial, loading: false }, locale: 'en-US', now: 50000 }));
    expect(usage).toContain(formatSubscriptionDate(walletSync / 1000, 'en-US', key => key));
    expect(usage).not.toContain(formatSubscriptionDate(latestSync / 1000, 'en-US', key => key));
    expect(usage).toContain(i18nService.t('maasSubscriptionSectionUnavailable'));
    const summary = renderToStaticMarkup(createElement(PlatformSubscriptionOverview, { data: partial, locale: 'en-US', now: 50000 }));
    expect(summary).toContain(i18nService.t('maasSubscriptionSectionUnavailable'));
    expect(summary).not.toContain(formatSubscriptionDate(walletSync / 1000, 'en-US', key => key));
  });
});
