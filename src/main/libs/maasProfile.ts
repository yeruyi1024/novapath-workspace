import { randomUUID } from 'crypto';

import type { MaasAccount, MaasResult, MaasSnapshot } from '../../shared/auth/maas';
import { type MaasProfileError, type MaasProfileProgress, normalizeProfileEmail, normalizeProfilePhone } from '../../shared/auth/maasProfile';

export const profileEndpoints = {
  profileUpdate: { path: '/api/user/self', method: 'PUT', bearer: true },
  profileEmailCode: { path: '/api/verification', method: 'GET', bearer: false },
  profileEmailBind: { path: '/api/oauth/email/bind', method: 'POST', bearer: true },
  profilePhone: { path: '/api/user/self/phone', method: 'GET', bearer: true },
  profileSecurityCode: { path: '/api/user/self/phone/security/code', method: 'POST', bearer: true },
  profileSecurityVerify: { path: '/api/user/self/phone/security/verify', method: 'POST', bearer: true },
  profilePhoneCode: { path: '/api/user/self/phone/code', method: 'POST', bearer: true },
  profilePhoneBind: { path: '/api/user/self/phone/bind', method: 'POST', bearer: true },
} as const;

export interface ProfileOwner { origin: string; accountId: number; sessionId: string; epoch: number }
interface Response { status: number; body: Record<string, unknown>; retryAfterMs?: number }
export interface ProfilePort {
  owner: ProfileOwner;
  snapshot: () => MaasSnapshot;
  assertCurrent: () => void;
  request: (endpoint: keyof typeof profileEndpoints | 'status', payload?: object, query?: string, proof?: string) => Promise<Response>;
  sync: () => Promise<MaasAccount>;
  rotate: (body: Record<string, unknown>) => Promise<void>;
}
interface Challenge { token: string; expiresAt: number; retryAt: number }
interface Flow {
  id: string; owner: ProfileOwner; field: 'email' | 'phone'; expiresAt: number;
  captcha?: boolean; phoneAvailable?: boolean; phoneVerified?: boolean;
  email?: string; emailRetryAt?: number; security?: Challenge;
  proof?: string; proofExpiresAt?: number; binding?: Challenge; phone?: string;
}
function fail(error: MaasProfileError): never { throw new Error(error); }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : fail('unavailable');
const token = (value: unknown): string => typeof value === 'string' && value.length > 0 && value.length <= 8192 ? value : fail('unavailable');
const seconds = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value > 0
  ? Math.min(3600, value) : fail('unavailable');
const code = (value: unknown): string => typeof value === 'string' && /^\d{6}$/.test(value.trim()) ? value.trim() : fail('invalidInput');
const sameOwner = (a: ProfileOwner, b: ProfileOwner) => a.origin === b.origin && a.accountId === b.accountId && a.sessionId === b.sessionId && a.epoch === b.epoch;

function check(response: Response): Record<string, unknown> {
  const error = response.body.code;
  if (response.status === 429 || error === 'PHONE_RATE_LIMITED') fail('rateLimited');
  if (error === 'PHONE_SMS_UNAVAILABLE') fail('smsUnavailable');
  if (error === 'PHONE_ALREADY_BOUND') fail('alreadyUsed');
  if (error === 'PHONE_BINDING_PROTECTED') fail('protected');
  if (error === 'PHONE_NUMBER_INVALID') fail('invalidInput');
  if (error === 'PHONE_VERIFICATION_INVALID') fail('verificationInvalid');
  if (typeof error === 'string' && error.startsWith('SECURITY_PROOF_')) fail('expired');
  if (typeof error === 'string' && error.startsWith('AUTH_')) fail('accountChanged');
  if ([404, 405].includes(response.status)) fail('unavailable');
  if (response.status >= 500) fail('network');
  if (response.status < 200 || response.status >= 300 || response.body.success !== true) fail('rejected');
  return response.body;
}

/** Proofs and SMS challenges never leave this process or survive an identity change. */
export function createMaasProfileEditor() {
  let flow: Flow | undefined;
  const clear = () => { flow = undefined; };
  const execute = async (value: unknown, port: ProfilePort): Promise<MaasResult> => {
    let saved = false;
    let rotationPending = false;
    let ownedFlow: Flow | undefined;
    const result = (profile?: MaasProfileProgress): MaasResult => ({ success: true, snapshot: port.snapshot(), profile });
    try {
      const input = record(value);
      if (input.accountId !== port.owner.accountId) fail('accountChanged');
      port.assertCurrent();
      const request: ProfilePort['request'] = async (...args) => {
        port.assertCurrent();
        const response = await port.request(...args);
        port.assertCurrent();
        return response;
      };
      const finish = async () => {
        saved = true;
        clear();
        await port.sync();
        return result({ saved: true });
      };
      if (input.action === 'updateName') {
        if (typeof input.displayName !== 'string') fail('invalidInput');
        const name = input.displayName.trim();
        if (!name || Array.from(name).length > 20 || /[\u0000-\u001f\u007f]/.test(name)) fail('invalidInput');
        const account = await port.sync();
        check(await request('profileUpdate', { username: account.username, display_name: name }));
        return await finish();
      }
      if (input.action === 'begin') {
        if (input.field !== 'email' && input.field !== 'phone') fail('invalidInput');
        clear();
        const next: Flow = { id: randomUUID(), owner: { ...port.owner }, field: input.field, expiresAt: Date.now() + 15 * 60_000 };
        if (next.field === 'email') {
          const data = record(check(await request('status')).data);
          if (typeof data.turnstile_check !== 'boolean') fail('unavailable');
          next.captcha = data.turnstile_check;
        } else {
          const response = await request('profilePhone');
          if ([404, 405].includes(response.status)) next.phoneAvailable = false;
          else {
            const data = record(check(response).data);
            if (typeof data.sms_enabled !== 'boolean') fail('unavailable');
            next.phoneAvailable = data.sms_enabled;
            const verified = data.verified && record(data.verified);
            next.phoneVerified = Boolean(verified && verified.user_id === port.owner.accountId && verified.phone === data.phone);
          }
        }
        flow = next;
        return result({ flowId: next.id, emailCaptchaRequired: next.captcha,
          phoneAvailable: next.phoneAvailable, phoneVerified: next.phoneVerified, stage: 'security' });
      }
      const current = flow;
      if (!current || input.flowId !== current.id || !sameOwner(current.owner, port.owner)) fail('expired');
      ownedFlow = current;
      if (Date.now() >= current.expiresAt) fail('expired');
      if (input.action === 'cancel') { clear(); return result(); }
      if (input.action === 'emailCode' && current.field === 'email') {
        const email = normalizeProfileEmail(input.email);
        if ((current.emailRetryAt ?? 0) > Date.now()) fail('rateLimited');
        const status = record(check(await request('status')).data);
        if (status.turnstile_check !== false) fail('captchaRequired');
        // Invalidate a previous target before attempting a new delivery.
        current.email = undefined;
        current.emailRetryAt = Date.now() + 60_000;
        check(await request('profileEmailCode', undefined, `?email=${encodeURIComponent(email)}`));
        current.email = email;
        return result({ retryAt: current.emailRetryAt });
      }
      if (input.action === 'bindEmail' && current.field === 'email') {
        const email = normalizeProfileEmail(input.email);
        if (current.email !== email) fail('invalidInput');
        check(await request('profileEmailBind', { email, code: code(input.code) }));
        return await finish();
      }
      if (current.field !== 'phone') fail('invalidInput');
      if (!current.phoneAvailable) fail('smsUnavailable');
      const challenge = (body: Record<string, unknown>): Challenge => {
        const data = record(body.data);
        return { token: token(data.challenge_token), expiresAt: Date.now() + seconds(data.expires_in) * 1000,
          retryAt: Date.now() + seconds(data.retry_after) * 1000 };
      };
      if (input.action === 'phoneSecurityCode') {
        if (!current.phoneVerified) fail('invalidInput');
        if ((current.security?.retryAt ?? 0) > Date.now()) fail('rateLimited');
        current.security = challenge(check(await request('profileSecurityCode')));
        return result({ retryAt: current.security.retryAt });
      }
      if (input.action === 'phoneVerify') {
        let payload: object;
        if (input.method === 'password') {
          if (typeof input.password !== 'string' || !input.password || input.password.length > 1024
            || typeof input.twoFactorCode !== 'string' || (input.twoFactorCode && !/^\d{6}$/.test(input.twoFactorCode))) fail('invalidInput');
          payload = { scope: 'phone.manage', password: input.password, two_factor_code: input.twoFactorCode };
        } else if (input.method === 'sms') {
          if (!current.security || current.security.expiresAt <= Date.now()) fail('expired');
          payload = { scope: 'phone.manage', challenge_token: current.security.token, code: code(input.code) };
        } else return fail('invalidInput');
        const data = record(check(await request('profileSecurityVerify', payload)).data);
        current.proof = token(data.proof_token);
        if (typeof data.expires_at !== 'number' || !Number.isSafeInteger(data.expires_at * 1000) || data.expires_at * 1000 <= Date.now()) fail('expired');
        current.proofExpiresAt = data.expires_at * 1000;
        current.security = undefined;
        return result({ stage: 'binding' });
      }
      if (!current.proof || (current.proofExpiresAt ?? 0) <= Date.now()) fail('expired');
      if (input.action === 'phoneCode') {
        const phone = normalizeProfilePhone(input.phone);
        if ((current.binding?.retryAt ?? 0) > Date.now()) fail('rateLimited');
        current.phone = undefined;
        current.binding = challenge(check(await request('profilePhoneCode', { phone }, undefined, current.proof)));
        current.phone = phone;
        return result({ retryAt: current.binding.retryAt });
      }
      if (input.action === 'bindPhone') {
        const phone = normalizeProfilePhone(input.phone);
        if (current.phone !== phone) fail('invalidInput');
        if (!current.binding || current.binding.expiresAt <= Date.now()) fail('expired');
        const body = check(await request('profilePhoneBind', { challenge_token: current.binding.token, code: code(input.code) }, undefined, current.proof));
        saved = true;
        rotationPending = true;
        await port.rotate(body);
        rotationPending = false;
        return await finish();
      }
      return fail('invalidInput');
    } catch (error) {
      if (saved) {
        clear();
        return rotationPending ? { success: false, snapshot: port.snapshot(), profileError: 'sessionUpdateFailed', profile: { saved: true, syncPending: true } }
          : result({ saved: true, syncPending: true });
      }
      const message = error instanceof Error ? error.message : '';
      const known: MaasProfileError[] = ['invalidInput', 'accountChanged', 'expired', 'rejected', 'verificationInvalid', 'alreadyUsed',
        'protected', 'rateLimited', 'smsUnavailable', 'captchaRequired', 'network', 'unavailable'];
      const profileError = known.includes(message as MaasProfileError) ? message as MaasProfileError : 'network';
      // An old editor's late cancel/submit must not erase a newer editor.
      if ((profileError === 'accountChanged' || profileError === 'expired') && ownedFlow && ownedFlow === flow) clear();
      return { success: false, snapshot: port.snapshot(), profileError };
    }
  };
  return { execute, clear };
}
