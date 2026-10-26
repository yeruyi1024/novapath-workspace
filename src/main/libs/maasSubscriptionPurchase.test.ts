import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { estimateMaasPurchaseQuota, MaasPurchaseError, MaasPurchaseState } from '../../shared/auth/maasSubscriptionPurchase';
import { createMaasSubscriptionPurchaser, type MaasPurchaseContext } from './maasSubscriptionPurchase';

let directory: string;
let ctx: MaasPurchaseContext;
let clock: number;
const pay = vi.fn();
const context = vi.fn();
const create = () => createMaasSubscriptionPurchaser({ file: path.join(directory, 'purchases.json'), context, pay, now: () => clock });
const prepare = async (buyer: ReturnType<typeof create>) => (await buyer.prepare(12, 7)).confirmation!;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'novapath-wallet-'));
  clock = 1_800_000_000_000;
  ctx = { accountId: 12, origin: 'https://fixture.example', sessionId: 'private-session',
    wallet: { accountId: 12, quota: 10_000_000, usedQuota: 0, requestCount: 0, syncedAt: clock,
      display: { type: 'CNY', quotaPerUnit: 500000, exchangeRate: 7, symbol: '¥' } },
    data: { accountId: 12, origin: 'https://fixture.example', syncedAt: clock, billingPreference: 'subscription_first',
      historyComplete: true, paymentCompliance: true, errors: {}, subscriptions: [], plans: [{
        id: 7, title: 'Monthly', subtitle: '', price: 9.9, currency: 'USD', durationUnit: 'month', durationValue: 1,
        customSeconds: 0, totalAmount: 5000000, resetPeriod: 'daily', resetSeconds: 0, allowBalancePay: true, maxPurchasePerUser: 0,
      }] } };
  context.mockReset().mockImplementation(async () => structuredClone(ctx));
  pay.mockReset().mockResolvedValue({ status: 200, body: { success: true, data: null } });
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

describe('wallet purchase boundaries', () => {
  test('uses exact decimal ceil without float overestimation', () => {
    expect(estimateMaasPurchaseQuota(0.00007, 100000)).toBe(7);
    expect(estimateMaasPurchaseQuota(9.9, 500000)).toBe(4950000);
    expect(estimateMaasPurchaseQuota(1e-7, 500000)).toBe(1);
    expect(estimateMaasPurchaseQuota(0, 500000)).toBe(0);
    expect(() => estimateMaasPurchaseQuota(1e20, 500000)).toThrow();
  });
  test('confirms then posts only the plan once; no session is persisted or exposed', async () => {
    const buyer = create(); const confirmation = await prepare(buyer);
    expect(confirmation.chargedQuota).toBe(4950000);
    expect(await buyer.purchase(12, confirmation.confirmationId)).toEqual({ state: MaasPurchaseState.Succeeded });
    expect(pay).toHaveBeenCalledExactlyOnceWith(7);
    expect((await buyer.purchase(12, confirmation.confirmationId)).state).toBe(MaasPurchaseState.Rejected);
    expect(pay).toHaveBeenCalledOnce();
    expect(JSON.stringify(confirmation)).not.toContain('private-session');
    expect(fs.readFileSync(path.join(directory, 'purchases.json'), 'utf8')).not.toContain('private-session');
  });
  test.each([
    ['disabled payment', () => { ctx.data.paymentCompliance = false; }, MaasPurchaseError.Unavailable],
    ['unknown allowance', () => { ctx.data.plans[0].allowBalancePay = undefined; }, MaasPurchaseError.Unavailable],
    ['legacy currency', () => { ctx.data.plans[0].currency = 'CNY'; }, MaasPurchaseError.Currency],
    ['insufficient funds', () => { ctx.wallet.quota = 1; }, MaasPurchaseError.Balance],
    ['incomplete history', () => { ctx.data.historyComplete = false; }, MaasPurchaseError.Unavailable],
    ['partial failed reads', () => { ctx.data.errors = { subscriptions: true }; }, MaasPurchaseError.Unavailable],
  ] as const)('blocks %s before any payment', async (_name, mutate, error) => {
    mutate(); expect(await create().prepare(12, 7)).toMatchObject({ state: MaasPurchaseState.Rejected, error });
    expect(pay).not.toHaveBeenCalled();
  });
  test('lifetime limit includes expired administrator-granted subscriptions', async () => {
    ctx.data.plans[0].maxPurchasePerUser = 1;
    ctx.data.subscriptions = [{ id: 1, planId: 7, source: 'admin', status: 'expired', amountTotal: 0, amountUsed: 0, startTime: 1, endTime: 2, nextResetTime: 0 }];
    expect(await create().prepare(12, 7)).toMatchObject({ error: MaasPurchaseError.Limit });
    ctx.data.plans[0].maxPurchasePerUser = 0;
    expect((await create().prepare(12, 7)).state).toBe(MaasPurchaseState.Ready);
  });
  test('allows a zero-priced plan after explicit confirmation', async () => {
    ctx.data.plans[0].price = 0; ctx.wallet.quota = 0;
    const buyer = create(); const confirmation = await prepare(buyer);
    expect(confirmation.chargedQuota).toBe(0);
    expect((await buyer.purchase(12, confirmation.confirmationId)).state).toBe(MaasPurchaseState.Succeeded);
  });
  test('requires new confirmation after a price or plan change', async () => {
    const buyer = create(); const confirmation = await prepare(buyer);
    ctx.data.plans[0].price = 12;
    expect(await buyer.purchase(12, confirmation.confirmationId)).toMatchObject({ error: MaasPurchaseError.Changed });
    expect(pay).not.toHaveBeenCalled();
  });
  test('checks balance again immediately before submitting', async () => {
    const buyer = create(); const confirmation = await prepare(buyer); ctx.wallet.quota = 0;
    expect(await buyer.purchase(12, confirmation.confirmationId)).toMatchObject({ error: MaasPurchaseError.Balance });
    expect(pay).not.toHaveBeenCalled();
  });
  test('expired and replaced-session confirmations cannot purchase', async () => {
    const buyer = create(); const confirmation = await prepare(buyer); clock += 60001;
    expect(await buyer.purchase(12, confirmation.confirmationId)).toMatchObject({ error: MaasPurchaseError.Expired });
    const fresh = await prepare(buyer); ctx.sessionId = 'different-session';
    expect(await buyer.purchase(12, fresh.confirmationId)).toMatchObject({ error: MaasPurchaseError.Account });
    expect(pay).not.toHaveBeenCalled();
  });
  test('a confirmation cannot be submitted by another account', async () => {
    const buyer = create(); const confirmation = await prepare(buyer);
    expect(await buyer.purchase(13, confirmation.confirmationId)).toMatchObject({ state: MaasPurchaseState.Rejected });
    expect(pay).not.toHaveBeenCalled();
  });
  test('concurrent clicks produce one request', async () => {
    let finish!: (value: { status: number; body: object }) => void;
    pay.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const buyer = create(); const confirmation = await prepare(buyer);
    const first = buyer.purchase(12, confirmation.confirmationId);
    await vi.waitFor(() => expect(pay).toHaveBeenCalledOnce());
    expect(await buyer.purchase(12, confirmation.confirmationId)).toMatchObject({ error: MaasPurchaseError.Pending });
    finish({ status: 200, body: { success: true } }); await first;
  });
  test('unknown results survive restart, block all plan purchases and never auto-retry', async () => {
    pay.mockRejectedValue(new Error('connection lost'));
    const buyer = create(); const confirmation = await prepare(buyer);
    expect((await buyer.purchase(12, confirmation.confirmationId)).state).toBe(MaasPurchaseState.Unknown);
    const restarted = create(); expect(restarted.pending(ctx.origin, 12)).toBeDefined();
    expect(restarted.pending(ctx.origin, 13)).toBeUndefined();
    expect(await restarted.prepare(12, 7)).toMatchObject({ error: MaasPurchaseError.Pending });
    expect(pay).toHaveBeenCalledOnce();
    await restarted.clear(12); expect(restarted.pending(ctx.origin, 12)).toBeUndefined();
    expect(pay).toHaveBeenCalledOnce();
  });
  test.each([401, 403, 429])('a rejected HTTP %i POST is not retried', async status => {
    pay.mockResolvedValue({ status, body: { success: false } });
    const buyer = create(); const confirmation = await prepare(buyer);
    expect((await buyer.purchase(12, confirmation.confirmationId)).state).toBe(MaasPurchaseState.Rejected);
    expect(pay).toHaveBeenCalledOnce();
  });
  test('a server error is unknown even when it contains success=false', async () => {
    pay.mockResolvedValue({ status: 503, body: { success: false } });
    const buyer = create(); const confirmation = await prepare(buyer);
    expect((await buyer.purchase(12, confirmation.confirmationId)).state).toBe(MaasPurchaseState.Unknown);
  });
  test('a corrupt journal blocks purchasing instead of silently forgetting uncertainty', async () => {
    fs.writeFileSync(path.join(directory, 'purchases.json'), '{broken');
    expect(await create().prepare(12, 7)).toMatchObject({ error: MaasPurchaseError.Storage });
    expect(pay).not.toHaveBeenCalled();
  });
  test('failure to persist the pre-payment marker prevents the POST', async () => {
    const buyer = create(); const confirmation = await prepare(buyer);
    fs.mkdirSync(path.join(directory, 'purchases.json.tmp'));
    expect(await buyer.purchase(12, confirmation.confirmationId)).toMatchObject({ error: MaasPurchaseError.Storage });
    expect(pay).not.toHaveBeenCalled();
  });
});
