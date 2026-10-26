import type { MaasBillingSnapshot } from './maasBilling';
import type { MaasPendingPurchase } from './maasSubscriptionPurchase';

export const MaasSubscriptionStatus = { Active: 'active', Expired: 'expired', Cancelled: 'cancelled' } as const;
export const MaasBillingPreference = {
  SubscriptionFirst: 'subscription_first', WalletFirst: 'wallet_first', SubscriptionOnly: 'subscription_only', WalletOnly: 'wallet_only',
} as const;

export interface MaasPlan {
  id: number; title: string; subtitle: string; price: number; currency: string;
  durationUnit: string; durationValue: number; customSeconds: number;
  totalAmount: number; resetPeriod: string; resetSeconds: number;
  allowBalancePay?: boolean; maxPurchasePerUser?: number;
}
export interface MaasSubscription {
  id: number; planId: number; status: string; startTime: number; endTime: number;
  amountTotal: number; amountUsed: number; nextResetTime: number;
  source?: string; lastResetTime?: number; allowWalletOverflow?: boolean;
}
export interface MaasSubscriptions {
  accountId: number; origin: string; syncedAt: number; billingPreference: string;
  plans: MaasPlan[]; subscriptions: MaasSubscription[];
  historyComplete?: boolean;
  wallet?: MaasBillingSnapshot;
  paymentCompliance?: boolean;
  pendingPurchase?: MaasPendingPurchase;
  errors?: Partial<Record<'plans' | 'subscriptions' | 'wallet' | 'payment', boolean>>;
  sectionSyncedAt?: Partial<Record<'plans' | 'subscriptions' | 'wallet' | 'payment', number>>;
}

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalidResponse');
  return value as Record<string, unknown>;
};
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) throw new Error('invalidResponse');
  return value;
};
const integer = (value: unknown): number => {
  const result = number(value);
  if (!Number.isSafeInteger(result)) throw new Error('invalidResponse');
  return result;
};
const id = (value: unknown): number => {
  const result = integer(value);
  if (!result) throw new Error('invalidResponse');
  return result;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('invalidResponse');
  return value;
};
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || value.length > 1000) throw new Error('invalidResponse');
  return value;
};

/** Project public fields only; reject records belonging to another account. */
export function parseMaasPlans(plansValue: unknown): MaasPlan[] {
  return list(plansValue).map(item => {
    const plan = record(record(item).plan);
    return {
      id: id(plan.id), title: text(plan.title), subtitle: text(plan.subtitle ?? ''),
      price: number(plan.price_amount), currency: text(plan.currency),
      durationUnit: text(plan.duration_unit), durationValue: integer(plan.duration_value), customSeconds: integer(plan.custom_seconds ?? 0),
      totalAmount: integer(plan.total_amount), resetPeriod: text(plan.quota_reset_period), resetSeconds: integer(plan.quota_reset_custom_seconds ?? 0),
      allowBalancePay: typeof plan.allow_balance_pay === 'boolean' ? plan.allow_balance_pay : undefined,
      maxPurchasePerUser: plan.max_purchase_per_user === undefined ? undefined : integer(plan.max_purchase_per_user),
    };
  });
}

export function parseMaasSubscriptionRecords(selfValue: unknown, accountId: number): Pick<MaasSubscriptions, 'subscriptions' | 'billingPreference' | 'historyComplete'> {
  id(accountId);
  const self = record(selfValue);
  const subscriptions = list(self.all_subscriptions ?? self.subscriptions).map(item => {
    const sub = record(record(item).subscription);
    if (id(sub.user_id) !== accountId) throw new Error('invalidResponse');
    return {
      id: id(sub.id), planId: id(sub.plan_id), status: text(sub.status),
      startTime: integer(sub.start_time), endTime: integer(sub.end_time),
      amountTotal: integer(sub.amount_total), amountUsed: integer(sub.amount_used), nextResetTime: integer(sub.next_reset_time ?? 0),
      source: sub.source === undefined ? undefined : text(sub.source),
      lastResetTime: integer(sub.last_reset_time ?? 0),
      allowWalletOverflow: typeof sub.allow_wallet_overflow === 'boolean' ? sub.allow_wallet_overflow : undefined,
    };
  });
  return { subscriptions: [...new Map(subscriptions.map(sub => [sub.id, sub])).values()],
    billingPreference: text(self.billing_preference), historyComplete: Array.isArray(self.all_subscriptions) };
}

export function parseMaasSubscriptions(plansValue: unknown, selfValue: unknown, accountId: number, origin: string): MaasSubscriptions {
  return { accountId, origin, syncedAt: Date.now(), plans: parseMaasPlans(plansValue), ...parseMaasSubscriptionRecords(selfValue, accountId) };
}
