import { describe, expect, test, vi } from 'vitest';

import type { MaasProfileInput } from '../../shared/auth/maasProfile';
import { normalizeProfileEmail, normalizeProfilePhone } from '../../shared/auth/maasProfile';
import { createMaasProfileEditor, type ProfilePort } from './maasProfile';

const ok = (data: unknown = {}) => ({ status: 200, body: { success: true, data } });
const setup = () => {
  const editor = createMaasProfileEditor();
  const account = { id: 12, username: 'latest-user', displayName: 'Member', quota: 0, usedQuota: 0 };
  const port: ProfilePort = { owner: { origin: 'http://127.0.0.1:3313', accountId: 12, sessionId: 'sid', epoch: 1 },
    snapshot: () => ({ origin: 'http://127.0.0.1:3313', account }), assertCurrent: vi.fn(),
    request: vi.fn().mockResolvedValue(ok({})), sync: vi.fn().mockResolvedValue(account), rotate: vi.fn().mockResolvedValue(undefined) };
  const execute = (input: Omit<MaasProfileInput, 'accountId'> | Record<string, unknown>) => editor.execute({ accountId: 12, ...input }, port);
  return { editor, port, execute };
};
const challenge = () => ok({ challenge_token: 'secret-challenge', expires_in: 300, retry_after: 60 });

describe('profile updates use existing upstream contracts', () => {
  test('name update uses latest username and projects no other mutable fields', async () => {
    const { port, execute } = setup();
    expect((await execute({ action: 'updateName', displayName: ' 新昵称 ', username: 'stale', role: 100, quota: 99 })).success).toBe(true);
    expect(port.request).toHaveBeenCalledWith('profileUpdate', { username: 'latest-user', display_name: '新昵称' });
    expect(port.sync).toHaveBeenCalledTimes(2);
  });
  test('invalid names cannot cause writes', async () => {
    const { port, execute } = setup();
    for (const displayName of ['', 'x'.repeat(21), 'hello\nthere']) {
      expect((await execute({ action: 'updateName', displayName })).profileError).toBe('invalidInput');
    }
    expect(port.request).not.toHaveBeenCalled();
  });
  test('email binding requires a delivered code for the exact normalized address', async () => {
    const { port, execute } = setup();
    vi.mocked(port.request).mockResolvedValue(ok({ turnstile_check: false }));
    const flowId = (await execute({ action: 'begin', field: 'email' })).profile!.flowId;
    expect((await execute({ action: 'bindEmail', flowId, email: 'x@example.test', code: '123456' })).profileError).toBe('invalidInput');
    await execute({ action: 'emailCode', flowId, email: ' X@Example.Test ' });
    expect(port.request).toHaveBeenCalledWith('profileEmailCode', undefined, '?email=x%40example.test');
    expect((await execute({ action: 'emailCode', flowId, email: 'y@example.test' })).profileError).toBe('rateLimited');
    expect((await execute({ action: 'bindEmail', flowId, email: 'y@example.test', code: '123456' })).profileError).toBe('invalidInput');
    const result = await execute({ action: 'bindEmail', flowId, email: 'X@Example.Test', code: '123456' });
    expect(result.profile).toEqual({ saved: true });
    expect(port.request).toHaveBeenCalledWith('profileEmailBind', { email: 'x@example.test', code: '123456' });
    expect((await execute({ action: 'bindEmail', flowId, email: 'x@example.test', code: '123456' })).profileError).toBe('expired');
  });
  test('captcha enabled after begin cannot be bypassed by an old capability result', async () => {
    const { port, execute } = setup();
    vi.mocked(port.request).mockResolvedValueOnce(ok({ turnstile_check: false })).mockResolvedValueOnce(ok({ turnstile_check: true }));
    const flowId = (await execute({ action: 'begin', field: 'email' })).profile!.flowId;
    expect((await execute({ action: 'emailCode', flowId, email: 'x@example.test' })).profileError).toBe('captchaRequired');
    expect(port.request).toHaveBeenCalledTimes(2);
  });
  test('identity changes, stale flow IDs and cancellation invalidate proofs', async () => {
    const { port, editor, execute } = setup();
    vi.mocked(port.request).mockResolvedValue(ok({ turnstile_check: false }));
    const flowId = (await execute({ action: 'begin', field: 'email' })).profile!.flowId;
    expect((await execute({ action: 'emailCode', flowId, accountId: 99, email: 'x@example.test' })).profileError).toBe('accountChanged');
    editor.clear();
    expect((await execute({ action: 'emailCode', flowId, email: 'x@example.test' })).profileError).toBe('expired');
    const next = (await execute({ action: 'begin', field: 'email' })).profile!.flowId;
    editor.clear();
    expect((await execute({ action: 'emailCode', flowId: next, email: 'x@example.test' })).profileError).toBe('expired');
    expect(port.request).toHaveBeenCalledTimes(2);
  });
  test('late cancellation from an older editor cannot erase a newly opened flow', async () => {
    const { port, execute } = setup();
    vi.mocked(port.request).mockResolvedValue(ok({ turnstile_check: false }));
    const old = (await execute({ action: 'begin', field: 'email' })).profile!.flowId;
    const next = (await execute({ action: 'begin', field: 'email' })).profile!.flowId;
    expect((await execute({ action: 'cancel', flowId: old })).profileError).toBe('expired');
    expect((await execute({ action: 'emailCode', flowId: next, email: 'x@example.test' })).success).toBe(true);
  });
  test('late response after account switch is discarded without binding a code', async () => {
    const { port, execute } = setup();
    vi.mocked(port.assertCurrent).mockImplementationOnce(() => {}).mockImplementationOnce(() => {})
      .mockImplementation(() => { throw new Error('accountChanged'); });
    vi.mocked(port.request).mockResolvedValue(ok({ turnstile_check: false }));
    const result = await execute({ action: 'begin', field: 'email' });
    expect(result.profileError).toBe('accountChanged');
    expect(result.profile).toBeUndefined();
  });
  test('failed write never reports saved or retries, but failed read after save reports pending sync', async () => {
    const { port, execute } = setup();
    vi.mocked(port.request).mockRejectedValueOnce(new Error('network'));
    expect((await execute({ action: 'updateName', displayName: 'New' })).profileError).toBe('network');
    expect(port.request).toHaveBeenCalledTimes(1);
    vi.mocked(port.sync).mockResolvedValueOnce(port.snapshot().account!).mockRejectedValueOnce(new Error('network'));
    expect((await execute({ action: 'updateName', displayName: 'New' })).profile).toEqual({ saved: true, syncPending: true });
  });
});

describe('phone verification', () => {
  const phoneSetup = async () => {
    const state = setup();
    vi.mocked(state.port.request).mockResolvedValueOnce(ok({ phone: '+8613800000000', sms_enabled: true,
      verified: { phone: '+8613800000000', user_id: 12 } }));
    const flowId = (await state.execute({ action: 'begin', field: 'phone' })).profile!.flowId;
    return { ...state, flowId };
  };
  test('SMS unavailable and missing endpoints are distinct from login failure', async () => {
    const { port, execute } = setup();
    vi.mocked(port.request).mockResolvedValueOnce({ status: 404, body: {} });
    const result = await execute({ action: 'begin', field: 'phone' });
    expect(result.profile?.phoneAvailable).toBe(false);
    expect(result.success).toBe(true);
  });
  test('wrong current-account verification does not discard the authenticated snapshot', async () => {
    const { port, execute, flowId } = await phoneSetup();
    vi.mocked(port.request).mockResolvedValueOnce({ status: 401, body: { code: 'PHONE_VERIFICATION_INVALID' } });
    const result = await execute({ action: 'phoneVerify', flowId, method: 'password', password: 'invalid-test', twoFactorCode: '' });
    expect(result.profileError).toBe('verificationInvalid');
    expect(result.snapshot.account?.id).toBe(12);
    expect(port.rotate).not.toHaveBeenCalled();
  });
  test('proof and SMS challenge stay in main; binding accepts rotation then re-reads profile', async () => {
    const { port, execute, flowId } = await phoneSetup();
    vi.mocked(port.request).mockResolvedValueOnce(challenge());
    expect(JSON.stringify(await execute({ action: 'phoneSecurityCode', flowId }))).not.toContain('secret-challenge');
    vi.mocked(port.request).mockResolvedValueOnce(ok({ proof_token: 'secret-proof', expires_at: Math.floor(Date.now() / 1000) + 300 }));
    const verified = await execute({ action: 'phoneVerify', flowId, method: 'sms', code: '123456' });
    expect(verified.profile?.stage).toBe('binding');
    expect(JSON.stringify(verified)).not.toMatch(/secret-proof|secret-challenge/);
    vi.mocked(port.request).mockResolvedValueOnce(challenge());
    await execute({ action: 'phoneCode', flowId, phone: '13900000000' });
    expect(port.request).toHaveBeenLastCalledWith('profilePhoneCode', { phone: '+8613900000000' }, undefined, 'secret-proof');
    expect((await execute({ action: 'bindPhone', flowId, phone: '13800000000', code: '123456' })).profileError).toBe('invalidInput');
    vi.mocked(port.request).mockResolvedValueOnce(ok({ access_token: 'rotated-secret' }));
    const result = await execute({ action: 'bindPhone', flowId, phone: '+8613900000000', code: '123456' });
    expect(port.request).toHaveBeenLastCalledWith('profilePhoneBind', { challenge_token: 'secret-challenge', code: '123456' }, undefined, 'secret-proof');
    expect(port.rotate).toHaveBeenCalledTimes(1);
    expect(port.sync).toHaveBeenCalledTimes(1);
    expect(result.profile).toEqual({ saved: true });
    expect(JSON.stringify(result)).not.toContain('rotated-secret');
  });
  test('rotation save failure is explicit, not a successful profile sync', async () => {
    const { port, execute, flowId } = await phoneSetup();
    vi.mocked(port.request).mockResolvedValueOnce(ok({ proof_token: 'proof', expires_at: Math.floor(Date.now() / 1000) + 300 }));
    await execute({ action: 'phoneVerify', flowId, method: 'password', password: 'test', twoFactorCode: '' });
    vi.mocked(port.request).mockResolvedValueOnce(challenge());
    await execute({ action: 'phoneCode', flowId, phone: '13900000000' });
    vi.mocked(port.rotate).mockRejectedValueOnce(new Error('storage'));
    const result = await execute({ action: 'bindPhone', flowId, phone: '13900000000', code: '123456' });
    expect(result.success).toBe(false);
    expect(result.profileError).toBe('sessionUpdateFailed');
    expect(port.sync).not.toHaveBeenCalled();
  });
});

test('contact normalization follows the upstream phone and email bounds', () => {
  expect(normalizeProfilePhone('008613800000000')).toBe('+8613800000000');
  expect(normalizeProfileEmail(' Member@Example.Test ')).toBe('member@example.test');
  for (const value of ['123', 'file:///test', '+113800000000']) expect(() => normalizeProfilePhone(value)).toThrow();
  for (const value of ['bad', 'x'.repeat(60) + '@a.test', 'a@b.test\nother']) expect(() => normalizeProfileEmail(value)).toThrow();
});
