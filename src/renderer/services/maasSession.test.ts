import { afterEach, describe, expect, test, vi } from 'vitest';

import { DEFAULT_MAAS_ORIGIN, type MaasResult } from '../../shared/auth/maas';
import { parseMaasBillingSnapshot } from '../../shared/auth/maasBilling';
import { createMaasSessionStore, MaasSessionPhase } from './maasSession';

const snapshot = { origin: DEFAULT_MAAS_ORIGIN, account: { id: 12, username: 'demo', displayName: 'Demo', quota: 100, usedQuota: 1 } };
const signedIn: MaasResult = { success: true, snapshot };
const signedOut: MaasResult = { success: true, snapshot: { ...snapshot, account: null } };
afterEach(() => vi.useRealTimers());

const billed: MaasResult = { success: true, snapshot: { ...snapshot, billing: parseMaasBillingSnapshot({ id: 12, quota: 100, used_quota: 1, request_count: 4 },
  { quota_display_type: 'CNY', quota_per_unit: 500000, usd_exchange_rate: 7 }, 12, 100) } };

describe('platform billing refresh isolation', () => {
  test('merges simultaneous refresh requests and publishes current platform usage', async () => {
    let resolve!: (result: MaasResult) => void;
    const fetch = vi.fn(() => new Promise<MaasResult>(r => { resolve = r; }));
    const store = createMaasSessionStore(async () => signedOut, fetch);
    store.apply(signedIn);
    const first = store.refreshBilling();
    const second = store.refreshBilling();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.getState().billingLoading).toBe(true);
    resolve(billed);
    await Promise.all([first, second]);
    expect(store.getState()).toMatchObject({ phase: MaasSessionPhase.SignedIn, snapshot: billed.snapshot, billingLoading: false });
  });

  test('failed billing preserves good data and does not close the signed-in workspace', async () => {
    const store = createMaasSessionStore(async () => signedOut, async () => ({ ...billed, success: false, error: 'network' }));
    store.apply(billed);
    await store.refreshBilling();
    expect(store.getState()).toMatchObject({ phase: MaasSessionPhase.SignedIn, snapshot: billed.snapshot, billingError: 'network', billingLoading: false });
  });

  test('a successful logout wins over a late billing response', async () => {
    let resolve!: (result: MaasResult) => void;
    const store = createMaasSessionStore(async () => signedOut, () => new Promise(r => { resolve = r; }));
    store.apply(signedIn);
    const pending = store.refreshBilling();
    store.apply(signedOut);
    resolve(billed);
    await pending;
    expect(store.getState()).toEqual({ snapshot: signedOut.snapshot, phase: MaasSessionPhase.SignedOut });
  });

  test('rejects an otherwise successful billing response for a different account', async () => {
    const store = createMaasSessionStore(async () => signedOut, async () => ({ ...billed, snapshot: { ...billed.snapshot, account: { ...snapshot.account, id: 13 } } }));
    store.apply(signedIn);
    await store.refreshBilling();
    expect(store.getState()).toMatchObject({ billingError: 'invalidResponse', snapshot: { account: { id: 12 } } });
    expect(store.getState().snapshot.billing).toBeUndefined();
  });

  test('new account refresh follows an in-flight old account request', async () => {
    let resolve!: (result: MaasResult) => void;
    const nextAccount = { ...snapshot.account, id: 13 };
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<MaasResult>(r => { resolve = r; }))
      .mockResolvedValueOnce({ ...billed, snapshot: { ...billed.snapshot, account: nextAccount, billing: { ...billed.snapshot.billing!, accountId: 13 } } });
    const store = createMaasSessionStore(async () => signedOut, fetch);
    store.apply(signedIn);
    const old = store.refreshBilling();
    store.apply({ success: true, snapshot: { ...snapshot, account: nextAccount } });
    const fresh = store.refreshBilling();
    resolve(billed);
    await Promise.all([old, fresh]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.getState().snapshot.billing?.accountId).toBe(13);
  });

  test('a confirmed expired billing session closes the workspace', async () => {
    const store = createMaasSessionStore(async () => signedOut, async () => signedOut);
    store.apply(billed);
    await store.refreshBilling();
    expect(store.getState().phase).toBe(MaasSessionPhase.SignedOut);
    expect(store.getState().snapshot.billing).toBeUndefined();
  });
});

describe('platform startup entry gate', () => {
  test('stays closed until main process validates a restored session', async () => {
    let resolve!: (result: MaasResult) => void;
    const store = createMaasSessionStore(() => new Promise(r => { resolve = r; }));
    const checking = store.refresh();
    expect(store.getState().phase).toBe(MaasSessionPhase.Checking);
    resolve(signedIn);
    await checking;
    expect(store.getState()).toEqual({ snapshot, phase: MaasSessionPhase.SignedIn });
  });

  test('unsigned users go to login; a stale cached account with failed validation cannot grant entry', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(signedOut).mockResolvedValueOnce({ ...signedIn, success: false, error: 'network' });
    const store = createMaasSessionStore(fetch);
    await store.refresh();
    expect(store.getState().phase).toBe(MaasSessionPhase.SignedOut);
    await store.refresh();
    expect(store.getState()).toMatchObject({ phase: MaasSessionPhase.Error, snapshot: { account: null }, error: 'network' });
  });

  test('two-factor challenge is not a completed sign-in', () => {
    const store = createMaasSessionStore(async () => signedOut);
    store.apply({ success: true, snapshot: signedOut.snapshot, twoFactorFlow: 'test-flow' });
    expect(store.getState().phase).not.toBe(MaasSessionPhase.SignedIn);
    store.apply(signedIn);
    expect(store.getState().phase).toBe(MaasSessionPhase.SignedIn);
  });

  test('offline logout closes the workspace and keeps an honest remote-revocation notice', () => {
    const store = createMaasSessionStore(async () => signedOut);
    store.apply(signedIn);
    store.apply({ ...signedOut, logoutRemoteFailed: true });
    expect(store.getState()).toMatchObject({ phase: MaasSessionPhase.SignedOut, logoutRemoteFailed: true, snapshot: { account: null } });
  });

  test('confirmed revocation closes the workspace while a transient outage retains a validated session', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ...signedIn, success: false, error: 'network' }).mockResolvedValueOnce(signedOut);
    const store = createMaasSessionStore(fetch);
    store.apply(signedIn);
    await store.refresh();
    expect(store.getState()).toMatchObject({ phase: MaasSessionPhase.SignedIn, error: 'network' });
    await store.refresh();
    expect(store.getState()).toEqual({ snapshot: signedOut.snapshot, phase: MaasSessionPhase.SignedOut });
  });

  test('coalesces startup/focus checks and a successful logout wins over an older refresh', async () => {
    let resolve!: (result: MaasResult) => void;
    const fetch = vi.fn(() => new Promise<MaasResult>(r => { resolve = r; }));
    const store = createMaasSessionStore(fetch);
    store.apply(signedIn);
    const first = store.refresh();
    const second = store.refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    store.apply(signedOut);
    resolve(signedIn);
    await Promise.all([first, second]);
    expect(store.getState().phase).toBe(MaasSessionPhase.SignedOut);
  });

  test('IPC timeout is visible and a fresh retry can recover without late results unlocking the page', async () => {
    vi.useFakeTimers();
    let resolveOld!: (result: MaasResult) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<MaasResult>(r => { resolveOld = r; }))
      .mockResolvedValueOnce(signedOut);
    const store = createMaasSessionStore(fetch);
    const checking = store.refresh();
    await vi.advanceTimersByTimeAsync(25_000);
    await checking;
    expect(store.getState().phase).toBe(MaasSessionPhase.Error);
    await store.refresh();
    resolveOld(signedIn);
    await Promise.resolve();
    expect(store.getState().phase).toBe(MaasSessionPhase.SignedOut);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('account refresh regression guards', () => {
  test('a cleared main-process account still closes the workspace even if cleanup failed', async () => {
    const store = createMaasSessionStore(async () => ({ ...signedOut, success: false, error: 'network' }));
    store.apply(billed);
    await store.refresh();
    expect(store.getState()).toEqual({ snapshot: signedOut.snapshot, phase: MaasSessionPhase.Error, error: 'network' });
  });

  test('a failed response from another origin cannot clear the validated account', async () => {
    const store = createMaasSessionStore(async () => ({ success: false, error: 'network', snapshot: { origin: 'https://other.example', account: null } }));
    store.apply(billed);
    await store.refresh();
    expect(store.getState()).toMatchObject({ snapshot: billed.snapshot, phase: MaasSessionPhase.SignedIn, error: 'invalidResponse' });
  });

  test('billing timeout permits retry and ignores a late response', async () => {
    vi.useFakeTimers();
    let resolveOld!: (result: MaasResult) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<MaasResult>(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(billed);
    const store = createMaasSessionStore(async () => signedIn, fetch);
    store.apply(signedIn);
    const pending = store.refreshBilling();
    await vi.advanceTimersByTimeAsync(65_000);
    await pending;
    expect(store.getState()).toMatchObject({ billingLoading: false, billingError: 'network' });
    await store.refreshBilling();
    resolveOld(signedOut);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ snapshot: billed.snapshot, phase: MaasSessionPhase.SignedIn, billingError: undefined });
  });

  test('a synchronous snapshot bridge error can be retried', async () => {
    const fetch = vi.fn().mockImplementationOnce(() => { throw new Error('bridge unavailable'); }).mockResolvedValueOnce(signedIn);
    const store = createMaasSessionStore(fetch);
    await store.refresh();
    expect(store.getState().phase).toBe(MaasSessionPhase.Error);
    await store.refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.getState().phase).toBe(MaasSessionPhase.SignedIn);
  });

  test('a synchronous billing bridge error releases its pending request', async () => {
    const fetch = vi.fn().mockImplementationOnce(() => { throw new Error('bridge unavailable'); }).mockResolvedValueOnce(billed);
    const store = createMaasSessionStore(async () => signedIn, fetch);
    store.apply(signedIn);
    await store.refreshBilling();
    expect(store.getState().billingError).toBe('network');
    await store.refreshBilling();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(store.getState()).toMatchObject({ snapshot: billed.snapshot, billingLoading: false, billingError: undefined });
  });

  test('a failed refresh cannot replace validated data with a partial snapshot', async () => {
    const store = createMaasSessionStore(async () => ({ ...signedIn, success: false, error: 'network' }));
    store.apply(billed);
    await store.refresh();
    expect(store.getState()).toMatchObject({ snapshot: billed.snapshot, phase: MaasSessionPhase.SignedIn, error: 'network' });
  });

  test('a failed response cannot switch the workspace to another account', async () => {
    const store = createMaasSessionStore(async () => ({ success: false, error: 'network', snapshot: { ...snapshot, account: { ...snapshot.account, id: 99 } } }));
    store.apply(billed);
    await store.refresh();
    expect(store.getState()).toMatchObject({ snapshot: billed.snapshot, phase: MaasSessionPhase.SignedIn, error: 'invalidResponse' });
  });

  test('an earlier billing completion does not cancel a concurrent session revocation check', async () => {
    let resolveBilling!: (result: MaasResult) => void;
    let resolveAccount!: (result: MaasResult) => void;
    const store = createMaasSessionStore(() => new Promise(resolve => { resolveAccount = resolve; }), () => new Promise(resolve => { resolveBilling = resolve; }));
    store.apply(signedIn);
    const billing = store.refreshBilling();
    const account = store.refresh();
    resolveBilling(billed);
    await billing;
    resolveAccount(signedOut);
    await account;
    expect(store.getState()).toEqual({ snapshot: signedOut.snapshot, phase: MaasSessionPhase.SignedOut });
  });

  test('a billing result for another origin cannot sign out the current workspace', async () => {
    const store = createMaasSessionStore(async () => signedIn, async () => ({ ...signedOut, snapshot: { origin: 'https://other.example', account: null } }));
    store.apply(billed);
    await store.refreshBilling();
    expect(store.getState()).toMatchObject({ snapshot: billed.snapshot, phase: MaasSessionPhase.SignedIn, billingError: 'invalidResponse' });
  });
});
