import crypto from 'crypto';
import fs from 'fs';

import type { MaasBillingSnapshot } from '../../shared/auth/maasBilling';
import {
  estimateMaasPurchaseQuota,
  type MaasPendingPurchase,
  type MaasPurchaseConfirmation,
  MaasPurchaseError,
  MaasPurchaseJournalStatus,
  type MaasPurchaseResult,
  MaasPurchaseState,
} from '../../shared/auth/maasSubscriptionPurchase';
import type { MaasPlan, MaasSubscriptions } from '../../shared/auth/maasSubscriptions';

export interface MaasPurchaseContext {
  accountId: number; origin: string; sessionId: string; data: MaasSubscriptions; wallet: MaasBillingSnapshot;
}
interface Dependencies {
  file: string;
  context: (accountId: number) => Promise<MaasPurchaseContext>;
  pay: (planId: number) => Promise<{ status: number; body: Record<string, unknown> }>;
  now?: () => number;
}
const rejected = (error: MaasPurchaseError): MaasPurchaseResult => ({ state: MaasPurchaseState.Rejected, error });
const binding = (origin: string, accountId: number) => origin + '/' + accountId;
const fingerprint = (plan: MaasPlan, chargedQuota: number) => JSON.stringify([plan, chargedQuota]);

/** Company adapter only. The existing auth queue serializes context reads and wallet writes. */
export function createMaasSubscriptionPurchaser(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const confirmations = new Map<string, { confirmation: MaasPurchaseConfirmation; origin: string; sessionId: string }>();
  let busy = false;
  const read = (): MaasPendingPurchase[] => {
    if (!fs.existsSync(deps.file)) return [];
    const value: unknown = JSON.parse(fs.readFileSync(deps.file, 'utf8'));
    if (!Array.isArray(value) || value.length > 1000) throw new Error('storage');
    for (const item of value) {
      if (!item || typeof item.operationId !== 'string' || typeof item.origin !== 'string'
        || !Number.isSafeInteger(item.accountId) || item.accountId <= 0 || !Number.isSafeInteger(item.planId) || item.planId <= 0
        || !Number.isSafeInteger(item.chargedQuota) || item.chargedQuota < 0 || !Number.isSafeInteger(item.startedAt)
        || !Object.values(MaasPurchaseJournalStatus).includes(item.status)) throw new Error('storage');
    }
    return value;
  };
  const write = (record: MaasPendingPurchase) => {
    const records = read().filter(item => binding(item.origin, item.accountId) !== binding(record.origin, record.accountId));
    if (records.length >= 1000) throw new Error('storage');
    // Flush the marker before sending money; a crash must never silently re-enable a retry.
    const fd = fs.openSync(deps.file + '.tmp', 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify([...records, record])); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(deps.file + '.tmp', deps.file);
  };
  const pending = (origin: string, accountId: number) => read().find(item => item.origin === origin && item.accountId === accountId
    && (item.status === MaasPurchaseJournalStatus.Submitting || item.status === MaasPurchaseJournalStatus.Unknown));
  const check = (ctx: MaasPurchaseContext, planId: number): MaasPurchaseConfirmation | MaasPurchaseError => {
    const { data, wallet } = ctx;
    const plan = data.plans.find(item => item.id === planId);
    if (Object.values(data.errors ?? {}).some(Boolean) || data.paymentCompliance !== true || !plan || plan.allowBalancePay !== true) return MaasPurchaseError.Unavailable;
    if (plan.currency !== 'USD') return MaasPurchaseError.Currency;
    if (plan.maxPurchasePerUser === undefined || !data.historyComplete) return MaasPurchaseError.Unavailable;
    if (plan.maxPurchasePerUser > 0 && data.subscriptions.filter(sub => sub.planId === planId).length >= plan.maxPurchasePerUser) return MaasPurchaseError.Limit;
    const chargedQuota = estimateMaasPurchaseQuota(plan.price, wallet.display.quotaPerUnit);
    if (wallet.quota < chargedQuota) return MaasPurchaseError.Balance;
    return { confirmationId: crypto.randomUUID(), expiresAt: now() + 60_000, accountId: ctx.accountId, plan, wallet, chargedQuota };
  };
  const prepare = async (accountId: number, planId: number): Promise<MaasPurchaseResult> => {
    if (busy) return rejected(MaasPurchaseError.Pending);
    const ctx = await deps.context(accountId);
    try { if (pending(ctx.origin, accountId)) return rejected(MaasPurchaseError.Pending); } catch { return rejected(MaasPurchaseError.Storage); }
    const confirmation = check(ctx, planId);
    if (typeof confirmation === 'string') return rejected(confirmation);
    confirmations.clear();
    confirmations.set(confirmation.confirmationId, { confirmation, origin: ctx.origin, sessionId: ctx.sessionId });
    return { state: MaasPurchaseState.Ready, confirmation };
  };
  const purchase = async (accountId: number, confirmationId: string): Promise<MaasPurchaseResult> => {
    if (busy) return rejected(MaasPurchaseError.Pending);
    const stored = confirmations.get(confirmationId);
    if (!stored || stored.confirmation.accountId !== accountId || stored.confirmation.expiresAt <= now()) return rejected(MaasPurchaseError.Expired);
    confirmations.delete(confirmationId);
    busy = true;
    try {
      const ctx = await deps.context(accountId);
      if (stored.origin !== ctx.origin || stored.sessionId !== ctx.sessionId) return rejected(MaasPurchaseError.Account);
      try { if (pending(ctx.origin, accountId)) return rejected(MaasPurchaseError.Pending); } catch { return rejected(MaasPurchaseError.Storage); }
      const fresh = check(ctx, stored.confirmation.plan.id);
      if (typeof fresh === 'string') return rejected(fresh);
      if (stored.confirmation.expiresAt <= now()) return rejected(MaasPurchaseError.Expired);
      if (fingerprint(fresh.plan, fresh.chargedQuota) !== fingerprint(stored.confirmation.plan, stored.confirmation.chargedQuota)
        || JSON.stringify(fresh.wallet.display) !== JSON.stringify(stored.confirmation.wallet.display)) return rejected(MaasPurchaseError.Changed);
      const record: MaasPendingPurchase = { operationId: crypto.randomUUID(), origin: ctx.origin, accountId,
        planId: fresh.plan.id, chargedQuota: fresh.chargedQuota, startedAt: now(), status: MaasPurchaseJournalStatus.Submitting };
      try { write(record); } catch { return rejected(MaasPurchaseError.Storage); }
      let result: MaasPurchaseResult;
      try {
        // Never retry this POST, even after token expiry or a network error.
        const response = await deps.pay(fresh.plan.id);
        if (response.status === 200 && response.body.success === true) {
          record.status = MaasPurchaseJournalStatus.Succeeded;
          result = { state: MaasPurchaseState.Succeeded };
        } else if ((response.status === 200 && response.body.success === false) || response.status === 401 || response.status === 403 || response.status === 429) {
          record.status = MaasPurchaseJournalStatus.Rejected;
          result = rejected(response.status === 401 || response.status === 403 ? MaasPurchaseError.Account : MaasPurchaseError.Rejected);
        } else {
          record.status = MaasPurchaseJournalStatus.Unknown;
          result = { state: MaasPurchaseState.Unknown, pending: record };
        }
      } catch {
        record.status = MaasPurchaseJournalStatus.Unknown;
        result = { state: MaasPurchaseState.Unknown, pending: record };
      }
      try { write(record); } catch { /* The durable submitting marker still blocks a second payment. */ }
      return result;
    } finally { busy = false; }
  };
  const clear = async (accountId: number): Promise<MaasPurchaseResult> => {
    if (busy) return rejected(MaasPurchaseError.Pending);
    const ctx = await deps.context(accountId);
    try {
      const record = pending(ctx.origin, accountId);
      if (record) write({ ...record, status: MaasPurchaseJournalStatus.Rejected });
    } catch { return rejected(MaasPurchaseError.Storage); }
    return { state: MaasPurchaseState.Ready };
  };
  return { prepare, purchase, pending, clear };
}
