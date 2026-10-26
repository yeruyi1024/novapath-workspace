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
  responses: [] as { status: number; body: object; rawBody?: string; cookie?: string; network?: boolean; retryAfter?: string }[],
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
          const response = Object.assign(new EventEmitter(), { statusCode: planned.status,
            headers: planned.retryAfter ? { 'retry-after': planned.retryAfter } : {} });
          req.emit('response', response);
          response.emit('data', Buffer.from(planned.rawBody ?? JSON.stringify(planned.body)));
          response.emit('end');
        });
      } });
    state.requests.push({ options, req });
    return req;
  } },
}));

import { maasSessionFileName, registerMaasAuth } from './maasAuth';

const bundle = { success: true, data: { access_token: 'access-must-not-leak',
  session: { sid: 'session-1' }, user: { id: 12, username: 'demo', display_name: 'Demo', quota: 1000, used_quota: 20 } } };
const invoke = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!({ sender: state.host }, ...args);

const freshBundle = () => ({ ...bundle, data: { ...bundle.data, access_expires_at: Math.floor(Date.now() / 1000) + 900 } });

test.each([undefined, '120', 'Tue, 20 Oct 2026 12:02:00 GMT'])('refresh 429 cools queued reads until Retry-After %s', async retryAfter => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
  try {
    state.responses.push({ status: 200, body: { ...bundle, data: { ...bundle.data, access_expires_at: 1 } }, cookie: 'expired-access-cookie' });
    await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'test' });
    const file = path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN));
    const saved = fs.readFileSync(file, 'utf8');
    state.responses.push({ status: 429, body: {}, rawBody: '', retryAfter }, { status: 429, body: {}, rawBody: '', retryAfter });
    const results = await Promise.all([invoke(MaasIpc.Billing), invoke(MaasIpc.Subscriptions)]);
    results.forEach(result => expect(result).toMatchObject({ success: false, error: 'network', snapshot: { account: { id: 12 } } }));
    expect(state.requests.filter(r => r.options.url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).toBe(saved);
    const delay = retryAfter ? 120_000 : 60_000;
    clock.mockReturnValue(now + delay - 1);
    expect((await invoke(MaasIpc.Snapshot)).success).toBe(false);
    expect(state.requests.filter(r => r.options.url.endsWith('/auth/refresh'))).toHaveLength(1);
    state.responses.length = 0;
    clock.mockReturnValue(now + delay + 1);
    state.responses.push({ status: 200, body: freshBundle(), cookie: 'recovered-cookie' });
    expect((await invoke(MaasIpc.Snapshot)).success).toBe(true);
    expect(state.requests.filter(r => r.options.url.endsWith('/auth/refresh'))).toHaveLength(2);
  } finally { clock.mockRestore(); }
});

test('valid dashboard access reuses the JWT for wallet and snapshot reads without rotating refresh cookies', async () => {
  state.responses.push({ status: 200, body: freshBundle(), cookie: 'fresh-cookie' });
  await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'test' });
  const user = { ...bundle.data.user, request_count: 1 };
  const status = { quota_display_type: 'USD', quota_per_unit: 500000 };
  for (let i = 0; i < 2; i += 1) {
    state.responses.push({ status: 200, body: { success: true, data: user } },
      { status: 200, body: { success: true, data: status } });
    expect((await invoke(MaasIpc.Billing)).success).toBe(true);
  }
  state.responses.push({ status: 200, body: { success: true, data: user } });
  expect((await invoke(MaasIpc.Snapshot)).success).toBe(true);
  expect(state.requests.filter(r => r.options.url.endsWith('/auth/refresh'))).toHaveLength(0);
  expect(state.requests.filter(r => r.options.url.endsWith('/user/self'))).toHaveLength(3);
});

test('expired access metadata still refreshes before an authenticated wallet read', async () => {
  state.responses.push({ status: 200, body: { ...bundle, data: { ...bundle.data, access_expires_at: Math.floor(Date.now() / 1000) - 1 } }, cookie: 'expired-access-cookie' });
  await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'test' });
  state.responses.push({ status: 200, body: freshBundle(), cookie: 'renewed-cookie' },
    { status: 200, body: { success: true, data: { ...bundle.data.user, request_count: 0 } } },
    { status: 200, body: { success: true, data: { quota_display_type: 'USD', quota_per_unit: 500000 } } });
  expect((await invoke(MaasIpc.Billing)).success).toBe(true);
  expect(state.requests.filter(r => r.options.url.endsWith('/auth/refresh'))).toHaveLength(1);
});

test('a rejected fresh access token renews once and retries only the wallet GET', async () => {
  state.responses.push({ status: 200, body: freshBundle(), cookie: 'fresh-cookie' });
  await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'test' });
  state.responses.push({ status: 401, body: {} }, { status: 200, body: freshBundle(), cookie: 'renewed-cookie' },
    { status: 200, body: { success: true, data: { ...bundle.data.user, request_count: 0 } } },
    { status: 200, body: { success: true, data: { quota_display_type: 'USD', quota_per_unit: 500000 } } });
  expect((await invoke(MaasIpc.Billing)).success).toBe(true);
  expect(state.requests.filter(r => r.options.url.endsWith('/auth/refresh'))).toHaveLength(1);
  expect(state.requests.filter(r => r.options.url.endsWith('/user/self'))).toHaveLength(2);
  expect(state.requests.some(r => r.options.url.endsWith('/balance/pay'))).toBe(false);
});

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

describe('profile IPC', () => {
  const login = async () => {
    state.responses.push({ status: 200, body: freshBundle(), cookie: 'profile-cookie' });
    await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'test' });
  };
  test('allows only trusted sender and matching account; name saves through self and reads back', async () => {
    await login();
    expect(() => state.handlers.get(MaasIpc.Profile)!({ sender: {} }, { accountId: 12, action: 'updateName', displayName: 'New' })).toThrow('IPC sender');
    expect((await invoke(MaasIpc.Profile, { accountId: 99, action: 'updateName', displayName: 'New' })).profileError).toBe('accountChanged');
    state.responses.push({ status: 200, body: { success: true, data: { ...bundle.data.user, username: 'current-name' } } },
      { status: 200, body: { success: true } },
      { status: 200, body: { success: true, data: { ...bundle.data.user, username: 'current-name', display_name: '新昵称', email: 'member@example.test', phone: '+8613800000000' } } });
    const result = await invoke(MaasIpc.Profile, { accountId: 12, action: 'updateName', displayName: '新昵称', role: 100 });
    expect(result.profile?.saved).toBe(true);
    expect(result.snapshot.account).toMatchObject({ username: 'current-name', displayName: '新昵称', email: 'member@example.test', phone: '+8613800000000' });
    const update = state.requests.find(request => request.options.method === 'PUT');
    expect(new URL(update.options.url).pathname).toBe('/api/user/self');
    expect(JSON.parse(update.req.body)).toEqual({ username: 'current-name', display_name: '新昵称' });
  });
  test('phone rotation persists the encrypted cookie and uses the new access token for readback', async () => {
    await login();
    state.responses.push({ status: 200, body: { success: true, data: { phone: '', verified: null, sms_enabled: true } } });
    const flowId = (await invoke(MaasIpc.Profile, { accountId: 12, action: 'begin', field: 'phone' })).profile!.flowId;
    state.responses.push({ status: 200, body: { success: true, data: { proof_token: 'private-proof', expires_at: Math.floor(Date.now() / 1000) + 300 } } });
    await invoke(MaasIpc.Profile, { accountId: 12, action: 'phoneVerify', flowId, method: 'password', password: 'test', twoFactorCode: '' });
    state.responses.push({ status: 200, body: { success: true, data: { challenge_token: 'private-challenge', retry_after: 60, expires_in: 300 } } });
    await invoke(MaasIpc.Profile, { accountId: 12, action: 'phoneCode', flowId, phone: '13900000000' });
    state.responses.push({ status: 200, body: { success: true, data: { access_token: 'private-rotated-access', session: { sid: 'session-1' }, access_expires_at: Math.floor(Date.now() / 1000) + 900 } }, cookie: 'private-rotated-cookie' },
      { status: 200, body: { success: true, data: { ...bundle.data.user, phone: '+8613900000000' } } });
    const result = await invoke(MaasIpc.Profile, { accountId: 12, action: 'bindPhone', flowId, phone: '13900000000', code: '123456' });
    expect(result.success).toBe(true);
    expect(result.snapshot.account?.phone).toBe('+8613900000000');
    expect(state.requests.at(-1).req.headers.Authorization).toBe('Bearer private-rotated-access');
    expect(state.requests.at(-2).req.headers['X-Security-Proof']).toBe('private-proof');
    const saved = fs.readFileSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)), 'utf8');
    expect(saved).not.toContain('private-rotated-cookie');
    expect(JSON.stringify(result)).not.toMatch(/private-proof|private-challenge|private-rotated/);
    expect((await invoke(MaasIpc.Profile, { accountId: 12, action: 'bindPhone', flowId, phone: '13900000000', code: '123456' })).profileError).toBe('expired');
  });
  test('queued profile writes are rejected as soon as logout is requested', async () => {
    await login();
    state.responses.push({ status: 200, body: { success: true } });
    const write = invoke(MaasIpc.Profile, { accountId: 12, action: 'updateName', displayName: 'New' });
    const logout = invoke(MaasIpc.Logout);
    expect((await write).profileError).toBe('accountChanged');
    await logout;
    expect(state.requests.some(request => request.options.method === 'PUT')).toBe(false);
  });
});

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
    expect(fs.readFileSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)), 'utf8')).not.toContain('access-must-not-leak');
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
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
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
    expect(fs.readFileSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)), 'utf8')).not.toContain('invalid-test-password');
  });

  test('keeps 2FA pending until the second factor succeeds and never saves a password-only flow', async () => {
    state.responses.push({ status: 200, body: { success: true, data: { require_2fa: true, flow_token: 'pending-twofa' } } });
    const pending = await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'invalid-test-password' });
    expect(pending).toMatchObject({ success: true, twoFactorFlow: 'pending-twofa', snapshot: { account: null } });
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
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
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
  });

  test('classifies empty HTTP rate limits without treating them as an incompatible platform', async () => {
    state.responses.push({ status: 429, body: {}, rawBody: '' });
    expect(await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'invalid-test-password' }))
      .toMatchObject({ success: false, error: 'rateLimited', snapshot: { account: null } });
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
  });

  test('preserves account and encrypted storage when refresh returns an empty 429 or HTML outage', async () => {
    await login();
    const file = path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN));
    const saved = fs.readFileSync(file, 'utf8');
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      for (const [index, response] of [{ status: 429, rawBody: '' }, { status: 503, rawBody: '<html>Unavailable</html>' }].entries()) {
        clock.mockReturnValue(now + index * 60_001);
        const before = state.requests.length;
        state.responses.push({ ...response, body: {} });
        expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ success: false, error: 'network', snapshot: { account: { id: 12 } } });
        expect(state.requests).toHaveLength(before + 1);
        expect(fs.readFileSync(file, 'utf8')).toBe(saved);
      }
    } finally { clock.mockRestore(); }
  });

  test('still rejects a malformed successful login response', async () => {
    state.responses.push({ status: 200, body: {}, rawBody: '<html>Unexpected</html>' });
    expect(await invoke(MaasIpc.Login, { origin: DEFAULT_MAAS_ORIGIN, method: 'password', username: 'demo', password: 'invalid-test-password' }))
      .toMatchObject({ success: false, error: 'invalidResponse', snapshot: { account: null } });
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
    const saved = fs.readFileSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)), 'utf8');
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
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
  });

  test('resolves SID mismatch without a stale header then revokes the current session on logout', async () => {
    await login();
    state.responses.push({ status: 409, body: { success: false, code: 'AUTH_SESSION_MISMATCH' } },
      { status: 200, body: bundle, cookie: 'current-refresh' }, { status: 200, body: { success: true } });
    expect(await invoke(MaasIpc.Logout)).toMatchObject({ success: true, snapshot: { account: null } });
    expect(state.requests.at(-2).req.headers['X-Auth-Session']).toBeUndefined();
    expect(state.requests.at(-1).req.headers['X-Auth-Session']).toBe('session-1');
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
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
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
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
    const file = path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN));
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
    expect(fs.existsSync(path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN)))).toBe(false);
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

test('local startup ignores and preserves the old online session', async () => {
  const legacy = path.join(state.directory, 'maas-session.json');
  const content = JSON.stringify({ origin: 'https://gateway.ai.shilijia.xyz', ciphertext: 'foreign-encrypted-cookie' });
  fs.writeFileSync(legacy, content);
  state.sessions.clear();
  registerMaasAuth(() => ({ webContents: state.host }) as BrowserWindow);
  expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ success: true, snapshot: { origin: DEFAULT_MAAS_ORIGIN, account: null } });
  expect(state.requests).toHaveLength(0);
  expect(fs.readFileSync(legacy, 'utf8')).toBe(content);
});

test('a matching legacy session is migrated by refresh without deleting the original', async () => {
  await login();
  const current = path.join(state.directory, maasSessionFileName(DEFAULT_MAAS_ORIGIN));
  const content = fs.readFileSync(current, 'utf8');
  const legacy = path.join(state.directory, 'maas-session.json');
  fs.writeFileSync(legacy, content); fs.unlinkSync(current); state.sessions.clear();
  registerMaasAuth(() => ({ webContents: state.host }) as BrowserWindow);
  state.responses.push({ status: 200, body: bundle, cookie: 'new-local-refresh' });
  expect(await invoke(MaasIpc.Snapshot)).toMatchObject({ success: true, snapshot: { account: { id: 12 } } });
  expect(fs.existsSync(current)).toBe(true);
  expect(fs.readFileSync(legacy, 'utf8')).toBe(content);
});
