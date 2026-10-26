import type { MaasBillingSnapshot } from './maasBilling';
import type { MaasPlan } from './maasSubscriptions';

export const MaasPurchaseState = {
  Ready: 'ready', Succeeded: 'succeeded', Rejected: 'rejected', Unknown: 'unknown',
} as const;
export const MaasPurchaseError = {
  Unavailable: 'unavailable', Balance: 'balance', Limit: 'limit', Currency: 'currency',
  Changed: 'changed', Expired: 'expired', Pending: 'pending', Storage: 'storage',
  Account: 'account', Network: 'network', Rejected: 'rejected',
} as const;
export type MaasPurchaseError = typeof MaasPurchaseError[keyof typeof MaasPurchaseError];
export const MaasPurchaseJournalStatus = { Submitting: 'submitting', Unknown: 'unknown', Succeeded: 'succeeded', Rejected: 'rejected' } as const;

export interface MaasPendingPurchase {
  operationId: string; accountId: number; origin: string; planId: number; chargedQuota: number;
  startedAt: number; status: typeof MaasPurchaseJournalStatus[keyof typeof MaasPurchaseJournalStatus];
}
export interface MaasPurchaseConfirmation {
  confirmationId: string; expiresAt: number; accountId: number; plan: MaasPlan;
  wallet: MaasBillingSnapshot; chargedQuota: number;
}
export interface MaasPurchaseResult {
  state: typeof MaasPurchaseState[keyof typeof MaasPurchaseState];
  error?: MaasPurchaseError;
  confirmation?: MaasPurchaseConfirmation;
  pending?: MaasPendingPurchase;
}

/** Decimal arithmetic mirrors the platform's decimal multiplication followed by ceil. */
export function estimateMaasPurchaseQuota(price: number, quotaPerUnit: number): number {
  const decimal = (value: number): [bigint, number] => {
    if (!Number.isFinite(value) || value < 0) throw new Error('invalidResponse');
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    const scale = fraction.length - Number(exponent);
    return [BigInt(whole + fraction), scale];
  };
  if (quotaPerUnit <= 0) throw new Error('invalidResponse');
  const [p, ps] = decimal(price);
  const [q, qs] = decimal(quotaPerUnit);
  const scale = ps + qs;
  const divisor = 10n ** BigInt(Math.max(0, scale));
  const product = p * q * 10n ** BigInt(Math.max(0, -scale));
  const result = Number((product + divisor - 1n) / divisor);
  if (!Number.isSafeInteger(result)) throw new Error('invalidResponse');
  return result;
}
