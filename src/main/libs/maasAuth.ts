import crypto from 'crypto';
import { app, BrowserWindow, ipcMain, net, safeStorage, type Session,session } from 'electron';
import fs from 'fs';
import path from 'path';

import { DEFAULT_MAAS_ORIGIN, MaasIpc, type MaasResult, type MaasSnapshot, normalizeMaasOrigin, parseMaasAccount, parseMaasLoginInput } from '../../shared/auth/maas';
import { parseMaasBillingSnapshot } from '../../shared/auth/maasBilling';
import { type MaasSubscriptions, parseMaasPlans, parseMaasSubscriptionRecords, parseMaasSubscriptions } from '../../shared/auth/maasSubscriptions';
import { PRODUCT } from '../../shared/product';
import { createMaasProfileEditor, profileEndpoints, type ProfileOwner } from './maasProfile';
import { createMaasSubscriptionPurchaser, type MaasPurchaseContext } from './maasSubscriptionPurchase';

const COOKIE = 'new_api_refresh';
const AUTH_PATH = '/api/user/auth';
const ENDPOINTS = {
  refresh: { path: AUTH_PATH + '/refresh', method: 'POST', bearer: false },
  logout: { path: AUTH_PATH + '/logout', method: 'POST', bearer: false },
  status: { path: '/api/status', method: 'GET', bearer: false },
  password: { path: '/api/user/login', method: 'POST', bearer: false },
  twofa: { path: '/api/user/login/2fa', method: 'POST', bearer: false },
  sms: { path: '/api/user/login/sms', method: 'POST', bearer: false },
  smsCode: { path: '/api/user/login/sms/code', method: 'POST', bearer: false },
  self: { path: '/api/user/self', method: 'GET', bearer: true },
  plans: { path: '/api/subscription/plans', method: 'GET', bearer: true },
  subscriptions: { path: '/api/subscription/self', method: 'GET', bearer: true },
  paymentInfo: { path: '/api/user/topup/info', method: 'GET', bearer: true },
  purchase: { path: '/api/subscription/balance/pay', method: 'POST', bearer: true },
  managedKey: { path: '/api/apps/starpath/managed-key', method: 'POST', bearer: true },
  ...profileEndpoints,
} as const;

export function maasSessionFileName(origin: string): string {
  return 'maas-session-' + crypto.createHash('sha256').update(normalizeMaasOrigin(origin)).digest('hex').slice(0, 16) + '.json';
}

export function registerMaasAuth(getParent: () => BrowserWindow | null, trustedOrigin = DEFAULT_MAAS_ORIGIN): void {
  const platformOrigin = normalizeMaasOrigin(trustedOrigin);
  const resolveOrigin = (value: unknown) => {
    const origin = normalizeMaasOrigin(value);
    if (origin !== platformOrigin) throw new Error('invalidAddress');
    return origin;
  };
  const file = path.join(app.getPath('userData'), maasSessionFileName(platformOrigin));
  const legacyFile = path.join(app.getPath('userData'), 'maas-session.json');
  let snapshot: MaasSnapshot = { origin: platformOrigin, account: null };
  let sid: string | null = null;
  let accessToken: string | null = null;
  let accessExpiresAt = 0;
  let refreshBlockedUntil = 0;
  let initialized = false;
  let queue = Promise.resolve();
  let authEpoch = 0;
  let identityChanges = 0;
  const profileEditor = createMaasProfileEditor();
  const notifyIdentity = () => { authEpoch += 1; profileEditor.clear(); };

  const handle = (channel: string, handler: (input: unknown) => Promise<MaasResult>) => {
    ipcMain.handle(channel, (event, input: unknown) => {
      if (event.sender !== getParent()?.webContents) throw new Error('Invalid platform account IPC sender');
      const identityChange = [MaasIpc.Login, MaasIpc.OpenLogin, MaasIpc.Logout].some(value => value === channel);
      if (identityChange) { identityChanges += 1; notifyIdentity(); }
      return handler(input).finally(() => {
        if (identityChange) { identityChanges -= 1; notifyIdentity(); }
      });
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
    let restoreFile = fs.existsSync(file) ? file : undefined;
    if (!restoreFile && fs.existsSync(legacyFile)) {
      try {
        // Import only a matching legacy environment. Preserve other environments and the original file.
        if (JSON.parse(fs.readFileSync(legacyFile, 'utf8')).origin === platformOrigin) restoreFile = legacyFile;
      } catch { /* A foreign/old session must not prevent local sign-in. */ }
    }
    if (restoreFile) {
      if (!secureStorageAvailable()) throw new Error('storage');
      try {
        const saved = JSON.parse(fs.readFileSync(restoreFile, 'utf8'));
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

  const request = (origin: string, endpoint: keyof typeof ENDPOINTS, expectedSid?: string | null, payload?: object, query = '', proof?: string): Promise<{ status: number; body: Record<string, unknown>; retryAfterMs?: number }> => new Promise((resolve, reject) => {
    const definition = ENDPOINTS[endpoint];
    const req = net.request({ url: origin + definition.path + query, method: definition.method,
      session: getSession(origin), credentials: 'include', redirect: 'error' });
    req.setHeader('Origin', origin);
    req.setHeader('Accept', 'application/json');
    if (expectedSid) req.setHeader('X-Auth-Session', expectedSid);
    if (definition.bearer && accessToken) req.setHeader('Authorization', `Bearer ${accessToken}`);
    if (proof) req.setHeader('X-Security-Proof', proof);
    const timeout = setTimeout(() => { reject(new Error('network')); req.abort(); }, 20_000);
    req.on('error', () => { clearTimeout(timeout); reject(new Error('network')); });
    req.on('response', response => {
      let body = '';
      let retryAfterMs: number | undefined;
      if (response.statusCode === 429) {
        const header = response.headers['retry-after'];
        const value = (Array.isArray(header) ? header[0] : header)?.trim();
        const delay = value && /^\d+$/.test(value) ? Number(value) * 1000 : value ? Date.parse(value) - Date.now() : NaN;
        retryAfterMs = Number.isSafeInteger(delay) && delay >= 0 ? Math.max(1000, delay) : 60_000;
      }
      const result = (data: Record<string, unknown>) => ({ status: response.statusCode, body: data, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });
      response.on('data', chunk => {
        body += chunk.toString();
        if (body.length > 1_048_576) { clearTimeout(timeout); reject(new Error('invalidResponse')); req.abort(); }
      });
      response.on('error', () => { clearTimeout(timeout); reject(new Error('network')); });
      response.on('end', () => {
        clearTimeout(timeout);
        try { resolve(result(JSON.parse(body))); }
        catch {
          // Middleware may reject before JSON handling (for example an empty 429).
          // Let callers classify HTTP failures without losing an existing session.
          if (response.statusCode >= 400) resolve(result({}));
          else reject(new Error('invalidResponse'));
        }
      });
    });
    if (payload) {
      req.setHeader('Content-Type', 'application/json');
      req.write(JSON.stringify(payload));
    }
    req.end();
  });

  const acceptBundle = async (origin: string, body: Record<string, unknown>) => {
    const bundle = body.data as { session?: { sid?: unknown }; access_token?: unknown; access_expires_at?: unknown; user?: unknown } | undefined;
    if (!body.success || !bundle || typeof bundle.access_token !== 'string'
      || typeof bundle.session?.sid !== 'string') throw new Error('invalidResponse');
    const account = parseMaasAccount(bundle.user);
    await persist(origin);
    const billing = snapshot.origin === origin && snapshot.account?.id === account.id && sid === bundle.session.sid
      ? snapshot.billing : undefined;
    const identityChanged = snapshot.origin !== origin || snapshot.account?.id !== account.id || sid !== bundle.session.sid;
    snapshot = { origin, account, ...(billing ? { billing } : {}) };
    sid = bundle.session.sid;
    accessToken = bundle.access_token;
    accessExpiresAt = typeof bundle.access_expires_at === 'number' && Number.isSafeInteger(bundle.access_expires_at * 1000)
      ? bundle.access_expires_at * 1000 : 0;
    if (identityChanged) notifyIdentity();
  };

  const refresh = async (origin: string, expectedSid?: string | null): Promise<boolean> => {
    // A rejected renewal must not fan out through queued account consumers.
    // There is no retry timer: a later caller may try after the server's window.
    if (Date.now() < refreshBlockedUntil) throw new Error('network');
    let result = await request(origin, 'refresh', expectedSid);
    if (result.status === 409 && result.body.code === 'AUTH_SESSION_MISMATCH') {
      result = await request(origin, 'refresh');
    }
    if (result.status === 401) {
      if (origin === snapshot.origin) {
        snapshot = { origin, account: null };
        sid = null;
        accessToken = null;
        notifyIdentity();
        fs.rmSync(file, { force: true });
        await getSession(origin).clearStorageData();
      }
      return false;
    }
    if (result.status === 429) {
      refreshBlockedUntil = Date.now() + (result.retryAfterMs ?? 60_000);
      throw new Error('network');
    }
    if (result.status >= 500) throw new Error('network');
    await acceptBundle(origin, result.body);
    refreshBlockedUntil = 0;
    return true;
  };

  const hasFreshAccess = (origin: string, expectedSid?: string | null) => snapshot.origin === origin
    && Boolean(snapshot.account && sid && accessToken) && (!expectedSid || expectedSid === sid)
    && accessExpiresAt > Date.now() + 30_000;
  // Reads validate the existing JWT at the API. Rotate the refresh cookie only
  // when needed, rather than spending a critical-operation slot on every read.
  const ensureAccess = (origin: string, expectedSid?: string | null) => hasFreshAccess(origin, expectedSid)
    ? Promise.resolve(true) : refresh(origin, expectedSid);

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

  handle(MaasIpc.Profile, value => {
    const startedEpoch = authEpoch;
    const input = value as { accountId?: unknown; action?: unknown } | null;
    const work = run(async () => {
      const changed = (): MaasResult => ({ success: false, snapshot, profileError: 'accountChanged' });
      if (!Number.isSafeInteger(input?.accountId) || Number(input?.accountId) <= 0) {
        return { success: false, snapshot, profileError: 'invalidInput' };
      }
      if (identityChanges || authEpoch !== startedEpoch) return changed();
      await restore();
      if (snapshot.account?.id !== input!.accountId) return changed();
      const origin = snapshot.origin;
      if (!await ensureAccess(origin, sid)) return changed();
      if (identityChanges || snapshot.account?.id !== input!.accountId || !sid) return changed();
      let owner: ProfileOwner = { origin, accountId: snapshot.account.id, sessionId: sid, epoch: authEpoch };
      const assertCurrent = () => {
        if (identityChanges || snapshot.origin !== owner.origin || snapshot.account?.id !== owner.accountId
          || sid !== owner.sessionId || authEpoch !== owner.epoch) throw new Error('accountChanged');
      };
      if (input!.action === 'openPlatform') return { success: true, snapshot };
      return profileEditor.execute(value, {
        owner, snapshot: () => snapshot, assertCurrent,
        request: (endpoint, payload, query, proof) => request(origin, endpoint, owner.sessionId, payload, query, proof),
        sync: async () => {
          assertCurrent();
          const response = await request(origin, 'self', owner.sessionId);
          assertCurrent();
          if (response.status !== 200 || response.body.success !== true) throw new Error('network');
          const account = parseMaasAccount(response.body.data);
          if (account.id !== owner.accountId) throw new Error('accountChanged');
          snapshot = { ...snapshot, account };
          return account;
        },
        rotate: async body => {
          assertCurrent();
          const data = body.data as { access_token?: unknown; access_expires_at?: unknown; session?: { sid?: unknown } } | undefined;
          if (typeof data?.access_token !== 'string' || !data.access_token || data.session?.sid !== owner.sessionId
            || typeof data.access_expires_at !== 'number' || !Number.isSafeInteger(data.access_expires_at * 1000)
            || data.access_expires_at * 1000 <= Date.now()) throw new Error('invalidResponse');
          // Phone rotation has no user DTO: retain the JWT and encrypted cookie,
          // then read self. Never reconstruct an AuthBundle from renderer data.
          accessToken = data.access_token;
          accessExpiresAt = data.access_expires_at * 1000;
          notifyIdentity();
          owner = { ...owner, epoch: authEpoch };
          await persist(origin);
          assertCurrent();
        },
      });
    });
    if (input?.action !== 'openPlatform') return work;
    // CAPTCHA/passkey belongs to the platform. Do not hold the account queue
    // while this separate sandboxed window is open.
    return work.then(prepared => {
      if (!prepared.success || identityChanges || snapshot.account?.id !== input.accountId) return prepared;
      const origin = snapshot.origin;
      const browserEpoch = authEpoch;
      const window = new BrowserWindow({ width: 1000, height: 760, minWidth: 480, minHeight: 580,
        parent: getParent() ?? undefined, title: PRODUCT.englishName, autoHideMenuBar: true,
        webPreferences: { session: getSession(origin), nodeIntegration: false, contextIsolation: true, sandbox: true } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event, url) => {
        try { if (new URL(url).origin !== origin) event.preventDefault(); } catch { event.preventDefault(); }
      });
      return new Promise<MaasResult>(resolve => {
        let failed = false;
        window.on('closed', () => {
          void run(async () => {
            if (failed) return { success: false, snapshot, error: 'network' };
            if (identityChanges || snapshot.account?.id !== input.accountId || authEpoch !== browserEpoch) {
              return { success: false, snapshot, profileError: 'accountChanged' };
            }
            if (!await refresh(origin, sid) || snapshot.account?.id !== input.accountId) {
              return { success: false, snapshot, profileError: 'accountChanged' };
            }
            return { success: true, snapshot };
          }).then(resolve);
        });
        void window.loadURL(origin + '/profile').catch(() => { failed = true; if (!window.isDestroyed()) window.close(); });
      });
    });
  });

  const overview = async (expectedAccountId: number): Promise<MaasPurchaseContext> => {
    if (!Number.isSafeInteger(expectedAccountId) || expectedAccountId <= 0) throw new Error('invalidResponse');
    await restore();
    if (snapshot.account && snapshot.account.id !== expectedAccountId) throw new Error('invalidResponse');
    const origin = snapshot.origin;
    const cookies = await getSession(origin).cookies.get({ url: origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (!cookies.length) {
      snapshot = { origin, account: null }; sid = null; accessToken = null;
      fs.rmSync(file, { force: true });
      throw new Error('loginRejected');
    }
    if (!await ensureAccess(origin, sid)) throw new Error('loginRejected');
    if (snapshot.account?.id !== expectedAccountId || !sid) throw new Error('invalidResponse');
    const expectedSessionId = sid;
    const data: MaasSubscriptions = { accountId: expectedAccountId, origin, syncedAt: Date.now(), plans: [], subscriptions: [], billingPreference: '', errors: {} };
    let renewal: Promise<boolean> | undefined;
    const readData = async (endpoint: 'plans' | 'subscriptions' | 'self' | 'status' | 'paymentInfo') => {
      let response = await request(origin, endpoint, sid);
      if (response.status === 401 && endpoint !== 'status') {
        renewal ??= refresh(origin, sid);
        if (!await renewal) throw new Error('loginRejected');
        if (snapshot.account?.id !== expectedAccountId || sid !== expectedSessionId) throw new Error('invalidResponse');
        response = await request(origin, endpoint, sid);
      }
      if (response.status !== 200 || response.body.success !== true) throw new Error('network');
      return response.body.data;
    };
    const results = await Promise.allSettled([
      readData('plans').then(value => { data.plans = parseMaasPlans(value); }),
      readData('subscriptions').then(value => { Object.assign(data, parseMaasSubscriptionRecords(value, expectedAccountId)); }),
      Promise.all([readData('self'), readData('status')]).then(([user, status]) => {
        if (snapshot.account?.id !== expectedAccountId || sid !== expectedSessionId) throw new Error('invalidResponse');
        data.wallet = parseMaasBillingSnapshot(user, status, expectedAccountId);
        snapshot = { origin, account: parseMaasAccount(user), billing: data.wallet };
      }),
      readData('paymentInfo').then(value => {
        const info = value as { payment_compliance_confirmed?: unknown } | null;
        if (typeof info?.payment_compliance_confirmed !== 'boolean') throw new Error('invalidResponse');
        data.paymentCompliance = info.payment_compliance_confirmed;
      }),
    ]);
    const sections = ['plans', 'subscriptions', 'wallet', 'payment'] as const;
    if (snapshot.account?.id !== expectedAccountId || sid !== expectedSessionId) throw new Error('invalidResponse');
    results.forEach((result, i) => { if (result.status === 'rejected') data.errors![sections[i]] = true; });
    try { data.pendingPurchase = purchaser.pending(origin, expectedAccountId); } catch { data.errors!.payment = true; }
    return { accountId: expectedAccountId, origin, sessionId: sid, data, wallet: data.wallet! };
  };
  const purchaser = createMaasSubscriptionPurchaser({ file: path.join(app.getPath('userData'), 'maas-wallet-purchases.json'),
    context: overview, pay: planId => request(snapshot.origin, 'purchase', sid, { plan_id: planId }) });
  const purchaseInput = (value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('invalidResponse');
    const input = value as { accountId?: unknown; planId?: unknown; confirmationId?: unknown };
    if (!Number.isSafeInteger(input.accountId) || Number(input.accountId) <= 0) throw new Error('invalidResponse');
    return { ...input, accountId: Number(input.accountId) };
  };
  handle(MaasIpc.SubscriptionOverview, input => run(async () => {
    const ctx = await overview(Number(input));
    return { success: true, snapshot, subscriptions: ctx.data };
  }));
  handle(MaasIpc.PrepareSubscriptionPurchase, value => run(async () => {
    const input = purchaseInput(value);
    if (!Number.isSafeInteger(input.planId) || Number(input.planId) <= 0) throw new Error('invalidResponse');
    const purchase = await purchaser.prepare(input.accountId, Number(input.planId));
    return { success: true, snapshot, purchase };
  }));
  handle(MaasIpc.PurchaseSubscriptionWithBalance, value => run(async () => {
    const input = purchaseInput(value);
    if (typeof input.confirmationId !== 'string' || input.confirmationId.length > 100) throw new Error('invalidResponse');
    const purchase = await purchaser.purchase(input.accountId, input.confirmationId);
    return { success: true, snapshot, purchase };
  }));
  handle(MaasIpc.ClearPendingSubscriptionPurchase, input => run(async () => {
    const purchase = await purchaser.clear(Number(input));
    return { success: true, snapshot, purchase };
  }));

  handle(MaasIpc.Snapshot, () => run(async () => {
    await restore();
    const cookies = await getSession(snapshot.origin).cookies.get({ url: snapshot.origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (cookies.length) {
      const origin = snapshot.origin;
      if (!hasFreshAccess(origin, sid)) await refresh(origin, sid);
      else {
        const accountId = snapshot.account!.id;
        let self = await request(origin, 'self', sid);
        if (self.status === 401) {
          if (!await refresh(origin, sid)) return { success: true, snapshot };
          if (snapshot.account?.id !== accountId) throw new Error('invalidResponse');
          self = await request(origin, 'self', sid);
        }
        if (self.status !== 200 || self.body.success !== true) throw new Error('network');
        const account = parseMaasAccount(self.body.data);
        if (account.id !== accountId) throw new Error('invalidResponse');
        snapshot = { ...snapshot, account };
      }
    }
    else {
      snapshot = { origin: snapshot.origin, account: null };
      sid = null;
      accessToken = null;
      fs.rmSync(file, { force: true });
      notifyIdentity();
    }
    return { success: true, snapshot };
  }));

  handle(MaasIpc.Billing, () => run(async () => {
    await restore();
    const origin = snapshot.origin;
    const cookies = await getSession(origin).cookies.get({ url: origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (!cookies.length || !await ensureAccess(origin, sid)) {
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

  handle(MaasIpc.ManagedKey, input => run(async () => {
    const expectedAccountId = Number(input);
    if (!Number.isSafeInteger(expectedAccountId) || expectedAccountId <= 0) throw new Error('invalidResponse');
    await restore();
    const origin = snapshot.origin;
    if (snapshot.account?.id !== expectedAccountId || !await ensureAccess(origin, sid)) throw new Error('loginRejected');
    let result = await request(origin, 'managedKey', sid, {});
    if (result.status === 401) {
      if (!await refresh(origin, sid)) throw new Error('loginRejected');
      if (snapshot.account?.id !== expectedAccountId) throw new Error('invalidResponse');
      result = await request(origin, 'managedKey', sid, {});
    }
    const data = result.body.data as { key?: unknown } | undefined;
    if (result.status !== 200 || !result.body.success || typeof data?.key !== 'string' || !data.key || data.key.length > 256) throw new Error('network');
    if (snapshot.account?.id !== expectedAccountId) throw new Error('invalidResponse');
    return { success: true, snapshot, managedKey: { accountId: expectedAccountId, key: data.key } };
  }));

  handle(MaasIpc.Subscriptions, () => run(async () => {
    await restore();
    const origin = snapshot.origin;
    const cookies = await getSession(origin).cookies.get({ url: origin + AUTH_PATH + '/refresh', name: COOKIE });
    if (!cookies.length || !await ensureAccess(origin, sid)) {
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
