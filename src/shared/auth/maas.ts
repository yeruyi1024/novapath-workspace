import localEnvironment from './localMaasEnvironment.json';
import type { MaasBillingSnapshot } from './maasBilling';
import type { MaasProfileError, MaasProfileInput, MaasProfileProgress } from './maasProfile';
import type { MaasSubscriptions } from './maasSubscriptions';

export const MaasIpc = {
  Snapshot: 'maas:snapshot',
  Billing: 'maas:billing',
  Subscriptions: 'maas:subscriptions',
  ManagedKey: 'maas:managedKey',
  Login: 'maas:login',
  OpenLogin: 'maas:openLogin',
  Status: 'maas:status',
  SendSMS: 'maas:sendSMS',
  Logout: 'maas:logout',
  Profile: 'maas:profile',
} as const;

// Current integration phase uses the existing local MaaS service. Never fall back online.
export const LOCAL_MAAS_ORIGIN = localEnvironment.origin;
export const DEFAULT_MAAS_ORIGIN = LOCAL_MAAS_ORIGIN;

export interface MaasAccount {
  id: number;
  username: string;
  displayName: string;
  quota: number;
  usedQuota: number;
  email?: string;
  phone?: string;
  group?: string;
  role?: number;
  status?: number;
}

export interface MaasSnapshot {
  origin: string;
  account: MaasAccount | null;
  billing?: MaasBillingSnapshot;
}

export interface MaasResult {
  success: boolean;
  snapshot: MaasSnapshot;
  error?: 'network' | 'storage' | 'invalidAddress' | 'invalidResponse' | 'cancelled' | 'loginRejected' | 'rateLimited' | 'smsUnavailable';
  loginOptions?: { password: boolean; sms: boolean; captcha: boolean };
  twoFactorFlow?: string;
  smsChallenge?: { token: string; retryAfter: number; expiresIn: number };
  logoutRemoteFailed?: boolean;
  subscriptions?: MaasSubscriptions;
  managedKey?: { accountId: number; key: string };
  profile?: MaasProfileProgress;
  profileError?: MaasProfileError;
}

export type MaasLoginInput = { origin: string } & (
  | { method: 'password'; username: string; password: string }
  | { method: 'sms'; challengeToken: string; code: string }
  | { method: 'twofa'; flowToken: string; code: string }
);

export interface MaasAPI {
  snapshot: () => Promise<MaasResult>;
  billing: () => Promise<MaasResult>;
  subscriptions: () => Promise<MaasResult>;
  managedKey: (accountId: number) => Promise<MaasResult>;
  login: (input: MaasLoginInput) => Promise<MaasResult>;
  openLogin: (origin: string) => Promise<MaasResult>;
  status: (origin: string) => Promise<MaasResult>;
  sendSMS: (input: { origin: string; phone: string }) => Promise<MaasResult>;
  logout: () => Promise<MaasResult>;
  profile: (input: MaasProfileInput) => Promise<MaasResult>;
}

export function parseMaasLoginInput(value: unknown): MaasLoginInput {
  if (!value || typeof value !== 'object') throw new Error('loginRejected');
  const input = value as Record<string, unknown>;
  const origin = normalizeMaasOrigin(input.origin);
  const field = (key: string, limit: number) => {
    const text = input[key];
    if (typeof text !== 'string' || !text || text.length > limit) throw new Error('loginRejected');
    return text;
  };
  if (input.method === 'password') return { origin, method: 'password', username: field('username', 256), password: field('password', 1024) };
  if (input.method === 'sms') return { origin, method: 'sms', challengeToken: field('challengeToken', 512), code: field('code', 32) };
  if (input.method === 'twofa') return { origin, method: 'twofa', flowToken: field('flowToken', 512), code: field('code', 32) };
  throw new Error('loginRejected');
}

export function normalizeMaasOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('invalidAddress');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('invalidAddress'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('invalidAddress');
  }
  return url.origin;
}

/** Only this safe projection crosses IPC; never expose the AuthBundle. */
export function parseMaasAccount(value: unknown): MaasAccount {
  const user = value as Record<string, unknown> | null;
  if (!user || !Number.isSafeInteger(user.id) || Number(user.id) <= 0
    || typeof user.username !== 'string'
    || typeof user.quota !== 'number' || !Number.isFinite(user.quota)
    || typeof user.used_quota !== 'number' || !Number.isFinite(user.used_quota)) {
    throw new Error('invalidResponse');
  }
  return {
    id: Number(user.id), username: user.username,
    displayName: typeof user.display_name === 'string' ? user.display_name : user.username,
    quota: user.quota, usedQuota: user.used_quota,
    ...(typeof user.email === 'string' && user.email.trim().length <= 320 ? { email: user.email.trim() } : {}),
    ...(typeof user.phone === 'string' && user.phone.trim().length <= 32 ? { phone: user.phone.trim() } : {}),
    ...(typeof user.group === 'string' && user.group.trim().length <= 128 ? { group: user.group.trim() } : {}),
    ...(Number.isSafeInteger(user.role) && Number(user.role) >= 0 ? { role: Number(user.role) } : {}),
    ...(Number.isSafeInteger(user.status) && Number(user.status) >= 0 ? { status: Number(user.status) } : {}),
  };
}
