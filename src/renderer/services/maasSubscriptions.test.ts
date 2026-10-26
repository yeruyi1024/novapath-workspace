import { describe, expect, test, vi } from 'vitest';

import type { MaasResult } from '../../shared/auth/maas';
import { createMaasSubscriptionsStore } from './maasSubscriptions';

const result: MaasResult = { success: true, snapshot: { origin: 'https://fixture.example', account: { id: 12, username: 'fixture', displayName: 'fixture', quota: 0, usedQuota: 0 } }, subscriptions: { accountId: 12, origin: 'https://fixture.example', syncedAt: 1, billingPreference: 'wallet_only', plans: [], subscriptions: [] } };

describe('subscription refresh lifecycle', () => {
  test('merges in-flight reads and keeps last good data on failure', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(result).mockResolvedValueOnce({ ...result, success: false, error: 'network' });
    const store = createMaasSubscriptionsStore(12, result.snapshot.origin, fetch, vi.fn());
    const first = store.refresh(); expect(store.refresh()).toBe(first); await first;
    expect(fetch).toHaveBeenCalledTimes(1);
    await store.refresh();
    expect(store.getState()).toMatchObject({ data: result.subscriptions, error: 'network', loading: false });
  });
  test('rejects replacement account data', async () => {
    const store = createMaasSubscriptionsStore(13, result.snapshot.origin, async () => result, vi.fn());
    await store.refresh();
    expect(store.getState()).toEqual({ loading: false, error: 'invalidResponse' });
  });
  test('ignores late response after closing or switching account', async () => {
    let complete!: (value: MaasResult) => void;
    const signedOut = vi.fn();
    const store = createMaasSubscriptionsStore(12, result.snapshot.origin, () => new Promise(resolve => { complete = resolve; }), signedOut);
    const pending = store.refresh(); await Promise.resolve(); store.dispose(); complete({ success: true, snapshot: { ...result.snapshot, account: null } });
    await pending;
    expect(signedOut).not.toHaveBeenCalled();
    expect(store.getState().data).toBeUndefined();
  });
  test('clears results when platform confirms session expiry', async () => {
    const signedOut = vi.fn();
    const store = createMaasSubscriptionsStore(12, result.snapshot.origin, async () => ({ success: true, snapshot: { ...result.snapshot, account: null } }), signedOut);
    await store.refresh(); expect(signedOut).toHaveBeenCalledOnce(); expect(store.getState()).toEqual({ loading: false });
  });
  test('recovers after effect cleanup and remount', async () => {
    const store = createMaasSubscriptionsStore(12, result.snapshot.origin, async () => result, vi.fn());
    store.dispose(); store.activate(); await store.refresh(); expect(store.getState().data).toEqual(result.subscriptions);
  });
  test('rejects missing subscription projection', async () => {
    const store = createMaasSubscriptionsStore(12, result.snapshot.origin, async () => ({ ...result, subscriptions: undefined }), vi.fn());
    await store.refresh(); expect(store.getState().error).toBe('invalidResponse');
  });
});

test('a synchronous bridge failure can be retried', async () => {
  const fetch = vi.fn().mockImplementationOnce(() => { throw new Error('unavailable'); }).mockResolvedValueOnce(result);
  const store = createMaasSubscriptionsStore(12, result.snapshot.origin, fetch, vi.fn());
  await store.refresh(); expect(store.getState().error).toBe('network');
  await store.refresh(); expect(store.getState().data).toEqual(result.subscriptions);
});

test('a signed-out response from another origin cannot revoke the current account', async () => {
  const signedOut = vi.fn();
  const store = createMaasSubscriptionsStore(12, result.snapshot.origin, async () => ({ success: true, snapshot: { origin: 'https://other.example', account: null } }), signedOut);
  await store.refresh();
  expect(signedOut).not.toHaveBeenCalled();
  expect(store.getState()).toEqual({ loading: false, error: 'invalidResponse' });
});

test('partial reads retain each section with its own successful timestamp', async () => {
  const base = { ...result.subscriptions!, errors: {}, plans: [{ id: 7, title: 'Plan', subtitle: '', price: 1, currency: 'USD', durationUnit: 'month', durationValue: 1, customSeconds: 0, totalAmount: 100, resetPeriod: 'never', resetSeconds: 0 }], subscriptions: [{ id: 1, planId: 7, status: 'active', amountTotal: 100, amountUsed: 10, startTime: 1, endTime: 2000000000, nextResetTime: 0 }], historyComplete: true };
  const fetch = vi.fn().mockResolvedValueOnce({ ...result, subscriptions: base }).mockResolvedValueOnce({ ...result, subscriptions: { ...base, syncedAt: 20, plans: [], errors: { plans: true }, subscriptions: [{ ...base.subscriptions[0], amountUsed: 25 }] } });
  const store = createMaasSubscriptionsStore(12, result.snapshot.origin, fetch, vi.fn());
  await store.refresh(); await store.refresh();
  expect(store.getState().data?.plans).toEqual(base.plans);
  expect(store.getState().data?.subscriptions[0].amountUsed).toBe(25);
  expect(store.getState().data?.sectionSyncedAt).toMatchObject({ plans: 1, subscriptions: 20 });
  expect(store.getState().error).toBe('network');
});

test('a sudden empty success keeps earlier subscription evidence marked stale', async () => {
  const subscriptions = [{ id: 1, planId: 7, status: 'active', amountTotal: 100, amountUsed: 10, startTime: 1, endTime: 2000000000, nextResetTime: 0 }];
  const fetch = vi.fn().mockResolvedValueOnce({ ...result, subscriptions: { ...result.subscriptions, errors: {}, subscriptions } }).mockResolvedValueOnce({ ...result, subscriptions: { ...result.subscriptions, errors: {}, subscriptions: [], syncedAt: 20 } });
  const store = createMaasSubscriptionsStore(12, result.snapshot.origin, fetch, vi.fn());
  await store.refresh(); await store.refresh();
  expect(store.getState().data?.subscriptions).toEqual(subscriptions);
  expect(store.getState().data?.errors?.subscriptions).toBe(true);
});
