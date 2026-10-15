import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { DEFAULT_MAAS_ORIGIN, MaasIpc, type MaasResult } from '../../shared/auth/maas';

const state = vi.hoisted(() => ({
  directory: '', secure: true, host: {},
  handlers: new Map<string, (...args: unknown[]) => Promise<MaasResult>>(),
  sessions: new Map<string, any>(), windows: [] as any[], requests: [] as any[],
  responses: [] as { status: number; body: object; cookie?: string; network?: boolean }[],
}));

vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  ipcMain: { handle: (name: string, fn: (...args: unknown[]) => Promise<MaasResult>) => state.handlers.set(name, fn) },
  safeStorage: {
    isEncryptionAvailable: () => state.secure,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: (value: string) => Buffer.from(Buffer.from(value).toString('base64')),
    decryptString: (value: Buffer) => Buffer.from(value.toString(), 'base64').toString(),
  },
  session: { fromPartition: (partition: string) => {
    if (!state.sessions.has(partition)) {
      const cookies = Object.assign(new EventEmitter(), {
        value: '',
        get: async () => cookies.value ? [{ value: cookies.value, expirationDate: 2000000000 }] : [],
        set: async (cookie: { value: string }) => { cookies.value = cookie.value; },
      });
      state.sessions.set(partition, { cookies, setPermissionRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(), clearStorageData: async () => { cookies.value = ''; } });
    }
    return state.sessions.get(partition);
  } },
  BrowserWindow: class extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
    destroyed = false;
    constructor(public options: any) { super(); state.windows.push(this); }
    loadURL = vi.fn(async () => undefined);
    isDestroyed() { return this.destroyed; }
    close() { this.destroyed = true; this.emit('closed'); }
  },
  net: { request: (options: any) => {
    const req = Object.assign(new EventEmitter(), { headers: {} as Record<string, string>,
      write: (body: string) => { req.body = body; }, body: '',
      setHeader: (name: string, value: string) => { req.headers[name] = value; },
      abort: vi.fn(), end: () => {
        const planned = state.responses.shift();
        if (!planned) throw new Error('Unexpected request');
        queueMicrotask(() => {
          if (planned.network) { req.emit('error', new Error('offline')); return; }
          if (planned.cookie) options.session.cookies.value = planned.cookie;
          const response = Object.assign(new EventEmitter(), { statusCode: planned.status });
          req.emit('response', response);
          response.emit('data', Buffer.from(JSON.stringify(planned.body)));
          response.emit('end');
        });
      } });
    state.requests.push({ options, req });
    return req;
  } },
}));

import { registerMaasAuth } from './maasAuth';

const bundle = { success: true, data: { access_token: 'access-must-not-leak',
  session: { sid: 'session-1' }, user: { id: 12, username: 'demo', display_name: 'Demo', quota: 1000, used_quota: 20 } } };
const invoke = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!({ sender: state.host }, ...args);

async function login() {
  state.responses.push({ status: 200, body: bundle, cookie: 'rotated-refresh-secret' });
  const result = invoke(MaasIpc.OpenLogin, DEFAULT_MAAS_ORIGIN);
  await vi.waitFor(() => expect(state.windows).toHaveLength(1));
  const window = state.windows[0];
  window.options.webPreferences.session.cookies.value = 'login-refresh-secret';
  window.webContents.emit('did-finish-load');
  return result;
}

beforeEach(() => {
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'starpath-maas-test-'));
  state.secure = true;
  state.handlers.clear(); state.sessions.clear(); state.windows.length = 0;
  state.requests.length = 0; state.responses.length = 0;
  registerMaasAuth(() => ({ webContents: state.host }) as BrowserWindow);
});
afterEach(() => { fs.rmSync(state.directory, { recursive: true, force: true }); });

describe('maas desktop login lifecycle', () => {
  const walletUser = { id: 12, username: 'demo', display_name: 'Demo', quota: 4285772, used_quota: 2953408, request_count: 612 };
  const walletStatus = { quota_display_type: 'CNY', quota_per_unit: 500000, usd_exchange_rate: 7 };
  const queueBilling = (user = walletUser, status = walletStatus) => state.responses.push(
    { status: 200, body: bundle, cookie: 'billing-refresh' },
    { status: 200, body: { success: true, data: user } },
    { status: 200, body: { success: true, data: status } },
  );

  test('loads current wallet and display configuration with a private dashboard JWT', async () => {
    await login();
    queueBilling();
    const result = await invoke(MaasIpc.Billing);
    expect(result).toMatchObject({ success: true, snapshot: { account: { quota: 4285772 }, billing: {
      accountId: 12, quota: 4285772, usedQuota: 2953408, requestCount: 612,
      display: { type: 'CNY', quotaPerUnit: 500000, exchangeRate: 7 },
    } } });
    const self = state.requests.find(request => request.options.url.endsWith('/api/user/self'));
    expect(self.options.method).toBe('GET');
    expect(self.req.headers.Authorization).toBe('Bearer access-must-not-leak');
    expect(self.req.headers['X-Auth-Session']).toBe('session-1');
    expect(state.requests.at(-1).req.headers.Authorization).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('access-must-not-leak');
    expect(fs.readFileSync(path.join(state.directory, 'maas-session.json'), 'utf8')).not.toContain('access-must-not-leak');
  });

  test('billing requires the trusted renderer and never queries an unsigned account', async () => {
    expect(() => state.handlers.get(MaasIpc.Billing)!({ sender: {} })).toThrow('Invalid platform account IPC sender');
    expect(await invoke(MaasIpc.Billing)).toEqual({ success: true, snapshot: { origin: DEFAULT_MAAS_ORIGIN, account: null } });
    expect(state.requests).toHaveLength(0);
  });

  test('refreshes usage and currency together, keeping the last good snapshot on failure', async () => {
    await login();
    queueBilling();
    const first = await invoke(MaasIpc.Billing);
    queueBilling({ ...walletUser, quota: 4000000, used_quota: 3239180, request_count: 613 }, { ...walletStatus, usd_exchange_rate: 8 });
    expect(await invoke(MaasIpc.Billing)).toMatchObject({ success: true, snapshot: { billing: {
      quota: 4000000, requestCount: 613, display: { exchangeRate: 8 },
    } } });
    state.responses.push({ status: 503, body: { success: false } });
    expect(await invoke(MaasIpc.Billing)).toMatchObject({ success: false, error: 'network', snapshot: { billing: { quota: 4000000 } } });
    expect(first.snapshot.billing?.quota).toBe(4285772);
  });

  test('does not publish a mixed account or fabricated currency conversion', async () => {
    await login();
    queueBilling({ ...walletUser, id: 13 });
    expect(await invoke(MaasIpc.Billing)).toMatchObject({ success: false, error: 'invalidResponse', snapshot: { account: { id: 12 } } });
    queueBilling(walletUser, { ...walletStatus, usd_exchange_rate: 0 });
    expect(await invoke(MaasIpc.Billing)).toMatchObject({ success: false, error: 'invalidResponse' });
  });

  test('confirmed session expiry removes account and wallet together', async () => {
    await login();
    queueBilling();
    await invoke(MaasIpc.Billing);
    state.responses.push({ status: 401, body: { success: false } });
    expect(await invoke(MaasIpc.Billing)).toEqual({ success: true, snapshot: { origin: DEFAULT_MAAS_ORIGIN, account: null } });
    expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ snapshot: { account: null } });
    expect(fs.existsSync(path.join(state.directory, 'maas-session.json'))).toBe(false);
  });

  test('retries an expired dashboard JWT through refresh without exposing it', async () => {
    await login();
    state.responses.push(
      { status: 200, body: bundle, cookie: 'billing-refresh' },
      { status: 401, body: { success: false } },
      { status: 200, body: { ...bundle, data: { ...bundle.data, access_token: 'new-private-access' } }, cookie: 'new-refresh' },
      { status: 200, body: { success: true, data: walletUser } },
      { status: 200, body: { success: true, data: walletStatus } },
    );
    const result = await invoke(MaasIpc.Billing);
    expect(result.success).toBe(true);
    expect(state.requests.at(-2).req.headers.Authorization).toBe('Bearer new-private-access');
    expect(JSON.stringify(result)).not.toContain('new-private-access');
  });

  test('submits password credentials to the real API contract and returns only the safe account', async () => {
    state.responses.push({ status: 200, body: bundle, cookie: 'password-refresh' });
    const result = await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: ' demo ', password: 'invalid-test-password' });
    expect(result).toMatchObject({ success: true, snapshot: { account: { id: 12 } } });
    expect(state.requests[0].options.url).toBe(DEFAULT_MAAS_ORIGIN + '/api/user/login');
    expect(JSON.parse(state.requests[0].req.body)).toEqual({ username: 'demo', password: 'invalid-test-password' });
    expect(state.windows).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain('access-must-not-leak');
    expect(fs.readFileSync(path.join(state.directory, 'maas-session.json'), 'utf8')).not.toContain('invalid-test-password');
  });

  test('keeps 2FA pending until the second factor succeeds and never saves a password-only flow', async () => {
    state.responses.push({ status: 200, body: { success: true, data: { require_2fa: true, flow_token: 'pending-twofa' } } });
    const pending = await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'invalid-test-password' });
    expect(pending).toMatchObject({ success: true, twoFactorFlow: 'pending-twofa', snapshot: { account: null } });
    expect(fs.existsSync(path.join(state.directory, 'maas-session.json'))).toBe(false);
    state.responses.push({ status: 200, body: bundle, cookie: 'twofa-refresh' });
    expect(await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'twofa', flowToken: pending.twoFactorFlow, code: '123456' }))
      .toMatchObject({ success: true, snapshot: { account: { id: 12 } } });
    expect(state.requests.at(-1).options.url).toBe(DEFAULT_MAAS_ORIGIN + '/api/user/login/2fa');
    expect(JSON.parse(state.requests.at(-1).req.body)).toEqual({ flow_token: 'pending-twofa', code: '123456' });
  });

  test('uses the SMS challenge contract and honors the platform retry interval', async () => {
    state.responses.push({ status: 200, body: { success: true, data: { challenge_token: 'sms-challenge', retry_after: 60, expires_in: 300 } } });
    const challenge = await invoke(MaasIpc.SendSMS, { origin: DEFAULT_MAAS_ORIGIN, phone: '13800000000' });
    expect(challenge.smsChallenge).toEqual({ token: 'sms-challenge', retryAfter: 60, expiresIn: 300 });
    state.responses.push({ status: 200, body: bundle, cookie: 'sms-refresh' });
    expect(await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'sms', challengeToken: challenge.smsChallenge?.token, code: '123456' }))
      .toMatchObject({ success: true, snapshot: { account: { id: 12 } } });
    expect(JSON.parse(state.requests.at(-1).req.body)).toEqual({ challenge_token: 'sms-challenge', code: '123456' });
  });

  test('maps rejected credentials and SMS rate limiting without creating a logged-in session', async () => {
    state.responses.push({ status: 200, body: { success: false, message: 'incorrect password' } });
    expect(await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'invalid-test-password' }))
      .toMatchObject({ success: false, error: 'loginRejected', snapshot: { account: null } });
    state.responses.push({ status: 429, body: { success: false, code: 'PHONE_RATE_LIMITED' } });
    expect(await invoke(MaasIpc.SendSMS, { origin: DEFAULT_MAAS_ORIGIN, phone: '13800000000' }))
      .toMatchObject({ success: false, error: 'rateLimited' });
    expect(fs.existsSync(path.join(state.directory, 'maas-session.json'))).toBe(false);
  });

  test('returns only available sign-in methods without exposing registration', async () => {
    state.responses.push({ status: 200, body: { success: true, data: { password_login_enabled: true, sms_login: false, register_enabled: true, turnstile_check: false } } });
    const result = await invoke(MaasIpc.Status, DEFAULT_MAAS_ORIGIN);
    expect(result.loginOptions).toEqual({ password: true, sms: false, captcha: false });
    expect(JSON.stringify(result)).not.toContain('register');
    expect(state.requests[0].options.method).toBe('GET');
  });
  test('rejects account requests from another webContents', () => {
    expect(() => state.handlers.get(MaasIpc.Snapshot)!({ sender: {} })).toThrow('Invalid platform account IPC sender');
  });
  test('uses an isolated sandbox, sends the platform Origin, saves only encrypted Cookie and restores after restart', async () => {
    const result = await login();
    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).not.toContain('access-must-not-leak');
    expect(state.windows[0].options.webPreferences).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false });
    expect([...state.sessions.keys()][0]).not.toContain('persist:');
    expect(state.requests[0].req.headers.Origin).toBe(DEFAULT_MAAS_ORIGIN);
    const saved = fs.readFileSync(path.join(state.directory, 'maas-session.json'), 'utf8');
    expect(saved).not.toContain('rotated-refresh-secret');
    expect(saved).not.toContain('access-must-not-leak');
    state.sessions.clear();
    registerMaasAuth(() => ({ webContents: state.host }) as BrowserWindow);
    state.responses.push({ status: 200, body: bundle, cookie: 'next-refresh-secret' });
    const restored = await invoke(MaasIpc.Snapshot);
    expect(restored.snapshot.account?.id).toBe(12);
  });

  test('preserves the account on a transient outage and clears it on a confirmed 401', async () => {
    await login();
    state.responses.push({ status: 503, body: { success: false } });
    expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ success: false, error: 'network', snapshot: { account: { id: 12 } } });
    state.responses.push({ status: 401, body: { success: false, code: 'AUTH_UNAUTHORIZED' } });
    expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ success: true, snapshot: { account: null } });
    expect(fs.existsSync(path.join(state.directory, 'maas-session.json'))).toBe(false);
  });

  test('resolves SID mismatch without a stale header then revokes the current session on logout', async () => {
    await login();
    state.responses.push({ status: 409, body: { success: false, code: 'AUTH_SESSION_MISMATCH' } },
      { status: 200, body: bundle, cookie: 'current-refresh' }, { status: 200, body: { success: true } });
    expect(await invoke(MaasIpc.Logout)).toMatchObject({ success: true, snapshot: { account: null } });
    expect(state.requests.at(-2).req.headers['X-Auth-Session']).toBeUndefined();
    expect(state.requests.at(-1).req.headers['X-Auth-Session']).toBe('session-1');
    expect(fs.existsSync(path.join(state.directory, 'maas-session.json'))).toBe(false);
  });

  test('does not open a login window without secure storage', async () => {
    state.secure = false;
    expect(await invoke(MaasIpc.OpenLogin, DEFAULT_MAAS_ORIGIN)).toMatchObject({ success: false, error: 'storage' });
    expect(state.windows).toHaveLength(0);
  });

  test('signs out locally even when the server is unreachable and reports that remote revocation was not confirmed', async () => {
    await login();
    state.responses.push({ status: 503, body: { success: false } });
    expect(await invoke(MaasIpc.Logout)).toMatchObject({ success: true, logoutRemoteFailed: true, snapshot: { account: null } });
    expect([...state.sessions.values()][0].cookies.value).toBe('');
    expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ success: true, snapshot: { account: null } });
    expect(fs.existsSync(path.join(state.directory, 'maas-session.json'))).toBe(false);
  });

  test('never transmits credentials or opens a browser for an unapproved platform origin', async () => {
    expect(await invoke(MaasIpc.Login, { origin: 'https://other.example', method: 'password', username: 'demo', password: 'invalid-test-password' })).toMatchObject({ success: false, error: 'invalidAddress' });
    expect(await invoke(MaasIpc.OpenLogin, 'https://other.example')).toMatchObject({ success: false, error: 'invalidAddress' });
    expect(await invoke(MaasIpc.Status, 'https://other.example')).toMatchObject({ success: false, error: 'invalidAddress' });
    expect(state.requests).toHaveLength(0);
    expect(state.windows).toHaveLength(0);
  });

  test('a saved session from another origin is never sent there during startup restoration', async () => {
    await login();
    const file = path.join(state.directory, 'maas-session.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...saved, origin: 'https://other.example' }));
    state.sessions.clear(); state.requests.length = 0;
    registerMaasAuth(() => ({ webContents: state.host }) as BrowserWindow);
    expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ success: false, error: 'storage', snapshot: { account: null } });
    expect(state.requests).toHaveLength(0);
  });

  test('closing login without authenticating returns cancellation and leaves no credentials', async () => {
    const result = invoke(MaasIpc.OpenLogin, DEFAULT_MAAS_ORIGIN);
    await vi.waitFor(() => expect(state.windows).toHaveLength(1));
    state.windows[0].close();
    expect(await result).toMatchObject({ success: false, error: 'cancelled', snapshot: { account: null } });
    expect(fs.existsSync(path.join(state.directory, 'maas-session.json'))).toBe(false);
  });
});

const subscriptionPlans = [{ plan: { id: 2, title: '月包', price_amount: 10, currency: 'USD', duration_unit: 'month', duration_value: 1, total_amount: 500000, quota_reset_period: 'daily' } }];
const subscriptionSelf = { billing_preference: 'subscription_first', all_subscriptions: [{ subscription: { id: 3, user_id: 12, plan_id: 2, status: 'active', start_time: 1, end_time: 2000000000, amount_total: 500000, amount_used: 123 } }] };
function queueSubscriptions(self = subscriptionSelf) {
  state.responses.push({ status: 200, body: bundle, cookie: 'rotated-refresh-secret' },
    { status: 200, body: { success: true, data: subscriptionPlans } },
    { status: 200, body: { success: true, data: self } });
}

test('subscription queries authenticate both reads and never expose tokens or payment actions', async () => {
  await login(); queueSubscriptions();
  const result = await invoke(MaasIpc.Subscriptions);
  expect(result).toMatchObject({ success: true, subscriptions: { accountId: 12, subscriptions: [{ amountUsed: 123 }] } });
  const requests = state.requests.filter(item => item.options.url.includes('/api/subscription/'));
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request.options.method).toBe('GET');
    expect(request.req.headers.Authorization).toBe('Bearer access-must-not-leak');
    expect(request.req.headers.Origin).toBe(DEFAULT_MAAS_ORIGIN);
  }
  expect(JSON.stringify(result)).not.toMatch(/access-must-not-leak|refresh-secret/);
});

test('subscription query rejects records from a different user', async () => {
  await login(); queueSubscriptions({ ...subscriptionSelf, all_subscriptions: [{ subscription: { ...subscriptionSelf.all_subscriptions[0].subscription, user_id: 13 } }] });
  expect(await invoke(MaasIpc.Subscriptions)).toMatchObject({ success: false, error: 'invalidResponse' });
});

test('subscription query failure preserves verified login', async () => {
  await login(); state.responses.push({ status: 200, body: bundle, cookie: 'rotated-refresh-secret' }, { status: 503, body: {} });
  expect(await invoke(MaasIpc.Subscriptions)).toMatchObject({ success: false, snapshot: { account: { id: 12 } } });
});

test('subscription query clears expired login and does not request plans', async () => {
  await login(); state.responses.push({ status: 401, body: { success: false } });
  expect(await invoke(MaasIpc.Subscriptions)).toMatchObject({ success: true, snapshot: { account: null } });
  expect(state.requests.some(item => item.options.url.includes('/api/subscription/'))).toBe(false);
});

test('subscription reads refresh an expired access token then retry', async () => {
  await login();
  state.responses.push({ status: 200, body: bundle, cookie: 'rotated-refresh-secret' },
    { status: 401, body: {} }, { status: 200, body: bundle, cookie: 'rotated-refresh-secret' },
    { status: 200, body: { success: true, data: subscriptionPlans } },
    { status: 200, body: { success: true, data: subscriptionSelf } });
  expect(await invoke(MaasIpc.Subscriptions)).toMatchObject({ success: true, subscriptions: { accountId: 12 } });
});

test('subscription reads do not publish data after an authentication retry changes account', async () => {
  await login();
  state.responses.push({ status: 200, body: bundle, cookie: 'rotated-refresh-secret' },
    { status: 401, body: {} }, { status: 200, body: { ...bundle, data: { ...bundle.data, user: { ...bundle.data.user, id: 13 } } }, cookie: 'rotated-refresh-secret' });
  expect(await invoke(MaasIpc.Subscriptions)).toMatchObject({ success: false, error: 'invalidResponse' });
});
