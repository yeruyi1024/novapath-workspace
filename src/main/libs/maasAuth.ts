import crypto from 'crypto';
import { app, BrowserWindow, ipcMain, net, safeStorage, type Session,session } from 'electron';
import fs from 'fs';
import path from 'path';

import { DEFAULT_MAAS_ORIGIN, MaasIpc, type MaasResult, type MaasSnapshot, normalizeMaasOrigin, parseMaasAccount, parseMaasLoginInput } from '../../shared/auth/maas';
import { parseMaasBillingSnapshot } from '../../shared/auth/maasBilling';
import { parseMaasSubscriptions } from '../../shared/auth/maasSubscriptions';
import { PRODUCT } from '../../shared/product';

const COOKIE = 'new_api_refresh';
const AUTH_PATH = '/api/user/auth';
const ENDPOINTS = {
  refresh: AUTH_PATH + '/refresh', logout: AUTH_PATH + '/logout',
  status: '/api/status', password: '/api/user/login', twofa: '/api/user/login/2fa',
  sms: '/api/user/login/sms', smsCode: '/api/user/login/sms/code',
  self: '/api/user/self', plans: '/api/subscription/plans', subscriptions: '/api/subscription/self',
} as const;

export function registerMaasAuth(getParent: () => BrowserWindow | null, trustedOrigin = DEFAULT_MAAS_ORIGIN): void {
  const platformOrigin = normalizeMaasOrigin(trustedOrigin);
  const resolveOrigin = (value: unknown) => {
    const origin = normalizeMaasOrigin(value);
    if (origin !== platformOrigin) throw new Error('invalidAddress');
    return origin;
  };
  const file = path.join(app.getPath('userData'), 'maas-session.json');
  let snapshot: MaasSnapshot = { origin: platformOrigin, account: null };
  let sid: string | null = null;
  let accessToken: string | null = null;
  let initialized = false;
  let queue = Promise.resolve();

  const handle = (channel: string, handler: (input: unknown) => Promise<MaasResult>) => {
    ipcMain.handle(channel, (event, input: unknown) => {
      if (event.sender !== getParent()?.webContents) throw new Error('Invalid platform account IPC sender');
      return handler(input);
    });
  };

  const secureStorageAvailable = () => safeStorage.isEncryptionAvailable()
    && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text');

  const getSession = (origin: string): Session => {
    // No persist: prefix: Chromium must never write this Cookie in plaintext.
    const isolated = session.fromPartition(`maas-${crypto.createHash('sha256').update(origin).digest('hex')}`);
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    isolated.setPermissionCheckHandler(() => false);
    return isolated;
  };

  const persist = async (origin: string) => {
    if (!secureStorageAvailable()) throw new Error('storage');
    const [cookie] = await getSession(origin).cookies.get({ url: origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (!cookie?.value) throw new Error('invalidResponse');
    try {
      const ciphertext = safeStorage.encryptString(JSON.stringify({ value: cookie.value, expirationDate: cookie.expirationDate })).toString('base64');
      fs.writeFileSync(file + '.tmp', JSON.stringify({ origin, ciphertext }), { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
    } catch {
      throw new Error('storage');
    }
  };

  const restore = async () => {
    if (initialized) return;
    if (fs.existsSync(file)) {
      if (!secureStorageAvailable()) throw new Error('storage');
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        const origin = resolveOrigin(saved.origin);
        const cookie = JSON.parse(safeStorage.decryptString(Buffer.from(saved.ciphertext, 'base64')));
        snapshot = { origin, account: null };
        if (typeof cookie.value !== 'string' || !Number.isFinite(cookie.expirationDate)) throw new Error('storage');
        if (cookie.expirationDate > Date.now() / 1000) {
          await getSession(origin).cookies.set({ url: origin + AUTH_PATH, name: COOKIE,
            value: cookie.value, path: AUTH_PATH, httpOnly: true, sameSite: 'strict',
            secure: origin.startsWith('https:'), expirationDate: cookie.expirationDate });
        } else {
          fs.rmSync(file, { force: true });
        }
      } catch {
        throw new Error('storage');
      }
    }
    initialized = true;
  };

  const request = (origin: string, endpoint: keyof typeof ENDPOINTS, expectedSid?: string | null, payload?: object): Promise<{ status: number; body: Record<string, unknown> }> => new Promise((resolve, reject) => {
    const req = net.request({ url: origin + ENDPOINTS[endpoint], method: ['status', 'self', 'plans', 'subscriptions'].includes(endpoint) ? 'GET' : 'POST',
      session: getSession(origin), credentials: 'include', redirect: 'error' });
    req.setHeader('Origin', origin);
    req.setHeader('Accept', 'application/json');
    if (expectedSid) req.setHeader('X-Auth-Session', expectedSid);
    if (['self', 'plans', 'subscriptions'].includes(endpoint) && accessToken) req.setHeader('Authorization', `Bearer ${accessToken}`);
    const timeout = setTimeout(() => { reject(new Error('network')); req.abort(); }, 20_000);
    req.on('error', () => { clearTimeout(timeout); reject(new Error('network')); });
    req.on('response', response => {
      let body = '';
      response.on('data', chunk => {
        body += chunk.toString();
        if (body.length > 1_048_576) { reject(new Error('invalidResponse')); req.abort(); }
      });
      response.on('error', () => { clearTimeout(timeout); reject(new Error('network')); });
      response.on('end', () => {
        clearTimeout(timeout);
        try { resolve({ status: response.statusCode, body: JSON.parse(body) }); }
        catch { reject(new Error('invalidResponse')); }
      });
    });
    if (payload) {
      req.setHeader('Content-Type', 'application/json');
      req.write(JSON.stringify(payload));
    }
    req.end();
  });

  const acceptBundle = async (origin: string, body: Record<string, unknown>) => {
    const bundle = body.data as { session?: { sid?: unknown }; access_token?: unknown; user?: unknown } | undefined;
    if (!body.success || !bundle || typeof bundle.access_token !== 'string'
      || typeof bundle.session?.sid !== 'string') throw new Error('invalidResponse');
    const account = parseMaasAccount(bundle.user);
    await persist(origin);
    const billing = snapshot.origin === origin && snapshot.account?.id === account.id && sid === bundle.session.sid
      ? snapshot.billing : undefined;
    snapshot = { origin, account, ...(billing ? { billing } : {}) };
    sid = bundle.session.sid;
    accessToken = bundle.access_token;
  };

  const refresh = async (origin: string, expectedSid?: string | null): Promise<boolean> => {
    let result = await request(origin, 'refresh', expectedSid);
    if (result.status === 409 && result.body.code === 'AUTH_SESSION_MISMATCH') {
      result = await request(origin, 'refresh');
    }
    if (result.status === 401) {
      if (origin === snapshot.origin) {
        snapshot = { origin, account: null };
        sid = null;
        accessToken = null;
        fs.rmSync(file, { force: true });
        await getSession(origin).clearStorageData();
      }
      return false;
    }
    if (result.status >= 500 || result.status === 429) throw new Error('network');
    await acceptBundle(origin, result.body);
    return true;
  };

  const run = (work: () => Promise<MaasResult>): Promise<MaasResult> => {
    const pending = queue.then(work).catch((error: unknown): MaasResult => {
      const message = error instanceof Error ? error.message : '';
      const kind = ['storage', 'invalidAddress', 'invalidResponse', 'cancelled', 'loginRejected', 'rateLimited', 'smsUnavailable'].includes(message)
        ? message as MaasResult['error'] : 'network';
      return { success: false, snapshot, error: kind };
    });
    queue = pending.then((): void => {});
    return pending;
  };

  handle(MaasIpc.Snapshot, () => run(async () => {
    await restore();
    const cookies = await getSession(snapshot.origin).cookies.get({ url: snapshot.origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (cookies.length) await refresh(snapshot.origin, sid);
    else {
      snapshot = { origin: snapshot.origin, account: null };
      sid = null;
      accessToken = null;
      fs.rmSync(file, { force: true });
    }
    return { success: true, snapshot };
  }));

  handle(MaasIpc.Billing, () => run(async () => {
    await restore();
    const origin = snapshot.origin;
    const cookies = await getSession(origin).cookies.get({ url: origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (!cookies.length || !await refresh(origin, sid)) {
      snapshot = { origin, account: null };
      sid = null;
      accessToken = null;
      fs.rmSync(file, { force: true });
      return { success: true, snapshot };
    }
    const accountId = snapshot.account!.id;
    let self = await request(origin, 'self', sid);
    if (self.status === 401) {
      if (!await refresh(origin, sid)) return { success: true, snapshot };
      // Never associate an old request with a replacement account.
      if (snapshot.account?.id !== accountId) throw new Error('invalidResponse');
      self = await request(origin, 'self', sid);
    }
    if (self.status !== 200 || !self.body.success) throw new Error('network');
    const status = await request(origin, 'status');
    if (status.status !== 200 || !status.body.success) throw new Error('network');
    const billing = parseMaasBillingSnapshot(self.body.data, status.body.data, accountId);
    snapshot = { origin, account: parseMaasAccount(self.body.data), billing };
    return { success: true, snapshot };
  }));

  handle(MaasIpc.Subscriptions, () => run(async () => {
    await restore();
    const origin = snapshot.origin;
    const cookies = await getSession(origin).cookies.get({ url: origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (!cookies.length || !await refresh(origin, sid)) {
      snapshot = { origin, account: null };
      sid = null;
      accessToken = null;
      fs.rmSync(file, { force: true });
      return { success: true, snapshot };
    }
    const accountId = snapshot.account!.id;
    const authenticatedRead = async (endpoint: 'plans' | 'subscriptions') => {
      let response = await request(origin, endpoint, sid);
      if (response.status === 401) {
        if (!await refresh(origin, sid)) return null;
        if (snapshot.account?.id !== accountId) throw new Error('invalidResponse');
        response = await request(origin, endpoint, sid);
      }
      if (response.status !== 200 || response.body.success !== true) throw new Error('network');
      return response.body.data;
    };
    const plans = await authenticatedRead('plans');
    if (!snapshot.account) return { success: true, snapshot };
    const self = await authenticatedRead('subscriptions');
    if (!snapshot.account) return { success: true, snapshot };
    if (snapshot.account.id !== accountId) throw new Error('invalidResponse');
    return { success: true, snapshot, subscriptions: parseMaasSubscriptions(plans, self, accountId, origin) };
  }));

  handle(MaasIpc.Status, (input: unknown) => run(async () => {
    let origin: string;
    try { origin = resolveOrigin(input); } catch { throw new Error('invalidAddress'); }
    const result = await request(origin, 'status');
    const data = result.body.data as Record<string, unknown> | undefined;
    if (result.status !== 200 || !result.body.success || !data) throw new Error('network');
    return { success: true, snapshot, loginOptions: {
      password: data.password_login_enabled !== false, sms: data.sms_login === true, captcha: data.turnstile_check === true,
    } };
  }));

  handle(MaasIpc.SendSMS, (value: unknown) => run(async () => {
    const input = value as { origin?: unknown; phone?: unknown } | null;
    let origin: string;
    try { origin = resolveOrigin(input?.origin); } catch { throw new Error('invalidAddress'); }
    if (typeof input?.phone !== 'string' || !/^1[3-9]\d{9}$/.test(input.phone)) throw new Error('loginRejected');
    if (!secureStorageAvailable()) throw new Error('storage');
    const result = await request(origin, 'smsCode', null, { phone: input.phone });
    if (result.status === 429) throw new Error('rateLimited');
    if (result.body.code === 'PHONE_SMS_UNAVAILABLE') throw new Error('smsUnavailable');
    if (result.status >= 500) throw new Error('network');
    const data = result.body.data as Record<string, unknown> | undefined;
    if (!result.body.success) throw new Error('loginRejected');
    if (typeof data?.challenge_token !== 'string' || !data.challenge_token
      || typeof data.retry_after !== 'number' || !Number.isFinite(data.retry_after)
      || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in)) throw new Error('invalidResponse');
    return { success: true, snapshot, smsChallenge: { token: data.challenge_token,
      retryAfter: Math.min(3600, Math.max(1, data.retry_after)), expiresIn: Math.min(3600, Math.max(1, data.expires_in)) } };
  }));

  handle(MaasIpc.Login, (value: unknown) => run(async () => {
    const input = parseMaasLoginInput(value);
    resolveOrigin(input.origin);
    if (!secureStorageAvailable()) throw new Error('storage');
    const payload = input.method === 'password' ? { username: input.username.trim(), password: input.password }
      : input.method === 'sms' ? { challenge_token: input.challengeToken, code: input.code.trim() }
        : { flow_token: input.flowToken, code: input.code.trim() };
    const result = await request(input.origin, input.method, null, payload);
    if (result.status === 429) throw new Error('rateLimited');
    if (result.status >= 500) throw new Error('network');
    if (!result.body.success || result.status >= 300) throw new Error('loginRejected');
    const data = result.body.data as Record<string, unknown> | undefined;
    if (data?.require_2fa === true && input.method === 'password') {
      if (typeof data.flow_token !== 'string' || !data.flow_token) throw new Error('invalidResponse');
      return { success: true, snapshot, twoFactorFlow: data.flow_token };
    }
    await acceptBundle(input.origin, result.body);
    initialized = true;
    return { success: true, snapshot };
  }));

  handle(MaasIpc.OpenLogin, (input: unknown) => run(async () => {
    let origin: string;
    try { origin = resolveOrigin(input); } catch { throw new Error('invalidAddress'); }
    if (!secureStorageAvailable()) throw new Error('storage');
    // A damaged saved session must not prevent an explicit new login.
    initialized = true;
    const isolated = getSession(origin);
    const loginWindow = new BrowserWindow({ width: 1100, height: 780, minWidth: 420, minHeight: 600,
      parent: getParent() ?? undefined, title: `${PRODUCT.englishName} · ${origin}`, autoHideMenuBar: true,
      webPreferences: { session: isolated, nodeIntegration: false, contextIsolation: true, sandbox: true } });
    const childWindows = new Set<BrowserWindow>();
    loginWindow.webContents.on('did-create-window', child => {
      childWindows.add(child);
      child.on('closed', () => childWindows.delete(child));
    });
    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (!/^https?:\/\//.test(url)) return { action: 'deny' };
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true,
        webPreferences: { session: isolated, nodeIntegration: false, contextIsolation: true, sandbox: true } } };
    });
    loginWindow.webContents.on('will-navigate', (event, url) => {
      if (!/^https?:\/\//.test(url)) event.preventDefault();
    });
    return new Promise<MaasResult>(resolve => {
      let capturing = false;
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let result: MaasResult | undefined;
      let captureWork: Promise<void> | undefined;
      const capture = () => {
        if (capturing || done) return;
        capturing = true;
        captureWork = (async () => {
          try {
            if (await refresh(origin)) {
              result = { success: true, snapshot };
              if (!loginWindow.isDestroyed()) loginWindow.close();
            }
          } catch (error) {
            // Keep the platform page open so an interrupted exchange can be retried.
            const kind = error instanceof Error && error.message === 'storage' ? 'storage' : 'network';
            result = { success: false, snapshot, error: kind };
          } finally { capturing = false; }
        })();
      };
      const changed = (_event: Electron.Event, cookie: Electron.Cookie, _cause: string, removed: boolean) => {
        if (cookie.name !== COOKIE || removed || done || capturing) return;
        if (cookie.domain?.replace(/^\./, '') !== new URL(origin).hostname || cookie.path !== AUTH_PATH) return;
        clearTimeout(timer);
        timer = setTimeout(() => { void capture(); }, 500);
      };
      isolated.cookies.on('changed', changed);
      loginWindow.webContents.on('did-finish-load', () => {
        void isolated.cookies.get({ url: origin + AUTH_PATH + '/refresh', name: COOKIE })
          .then(cookies => { if (cookies.length) capture(); })
          .catch(() => { result = { success: false, snapshot, error: 'storage' }; });
      });
      loginWindow.on('closed', () => {
        done = true;
        clearTimeout(timer);
        isolated.cookies.removeListener('changed', changed);
        childWindows.forEach(child => { if (!child.isDestroyed()) child.close(); });
        // A refresh may finish after the window closes; resolve only after it settles.
        void (captureWork ?? Promise.resolve()).then(() => resolve(result ?? { success: false, snapshot, error: 'cancelled' }));
      });
      void loginWindow.loadURL(origin + '/sign-in').catch(() => {
        result = { success: false, snapshot, error: 'network' };
        if (!loginWindow.isDestroyed()) loginWindow.close();
      });
    });
  }));

  handle(MaasIpc.Logout, () => run(async () => {
    let logoutRemoteFailed = false;
    try {
      await restore();
      let result = await request(snapshot.origin, 'logout', sid);
      if (result.status === 409 && result.body.code === 'AUTH_SESSION_MISMATCH') {
        await refresh(snapshot.origin);
        result = await request(snapshot.origin, 'logout', sid);
      }
      logoutRemoteFailed = result.status !== 401 && (result.status >= 300 || result.body.success !== true);
    } catch {
      logoutRemoteFailed = true;
    }
    // Local sign-out must still succeed when the platform is temporarily offline.
    await getSession(snapshot.origin).clearStorageData();
    fs.rmSync(file, { force: true });
    snapshot = { origin: snapshot.origin, account: null };
    sid = null;
    accessToken = null;
    initialized = true;
    return { success: true, snapshot, ...(logoutRemoteFailed ? { logoutRemoteFailed } : {}) };
  }));
}
