import { useEffect, useRef, useState } from 'react';

import type { MaasAccount, MaasResult } from '../../../shared/auth/maas';
import { type MaasProfileField, type MaasProfileInput, type MaasProfileProgress, normalizeProfileEmail, normalizeProfilePhone } from '../../../shared/auth/maasProfile';
import { i18nService } from '../../services/i18n';
import { applyMaasResult } from '../../services/maasAccount';

type Action = MaasProfileInput extends infer T ? T extends { accountId: number } ? Omit<T, 'accountId'> : never : never;

export default function PlatformProfileEditor({ account, field, onCancel, onSaved, onBusyChange }: {
  account: MaasAccount; field: MaasProfileField; onCancel: () => void;
  onSaved: (syncPending: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [progress, setProgress] = useState<MaasProfileProgress>({});
  const [value, setValue] = useState(field === 'displayName' ? account.displayName : '');
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [method, setMethod] = useState<'password' | 'sms'>('password');
  const [sentTo, setSentTo] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(field !== 'displayName');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const locked = useRef(false);
  const flow = useRef<string>();
  const form = useRef<HTMLFormElement>(null);
  const t = (key: string) => i18nService.t(key);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const isSecurity = field === 'phone' && progress.stage !== 'binding';
  const normalizedTarget = (() => {
    try { return field === 'email' ? normalizeProfileEmail(value) : field === 'phone' ? normalizeProfilePhone(value) : value.trim(); }
    catch { return ''; }
  })();

  const request = async (action: Action): Promise<MaasResult | undefined> => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await window.electron.maas.profile({ ...action, accountId: account.id });
      if (!active.current) return;
      if (!result.success) {
        setError(result.profileError ?? 'network');
        return;
      }
      if (result.snapshot.account?.id !== account.id) { setError('accountChanged'); return; }
      applyMaasResult(result);
      setProgress(previous => ({ ...previous, ...result.profile }));
      if (result.profile?.flowId) flow.current = result.profile.flowId;
      if (result.profile?.saved) onSaved(Boolean(result.profile.syncPending));
      return result;
    } catch { if (active.current) setError('network'); }
    finally { locked.current = false; if (active.current) setBusy(false); }
  };

  useEffect(() => {
    active.current = true;
    const previous = document.activeElement;
    if (field !== 'displayName') void request({ action: 'begin', field });
    return () => {
      active.current = false;
      if (flow.current) void window.electron.maas.profile({ accountId: account.id, action: 'cancel', flowId: flow.current }).catch(() => {});
      // The parent first re-enables its row actions after this editor unmounts.
      requestAnimationFrame(() => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); });
    };
    // A keyed editor owns one account and field for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  useEffect(() => { (form.current?.querySelector<HTMLInputElement>('input') ?? form.current)?.focus(); }, [progress.flowId, progress.stage]);
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);

  const sendCode = async () => {
    if (!flow.current) return;
    const result = await request(isSecurity ? { action: 'phoneSecurityCode', flowId: flow.current }
      : field === 'email' ? { action: 'emailCode', email: value, flowId: flow.current }
        : { action: 'phoneCode', phone: value, flowId: flow.current });
    if (result && active.current) {
      setSentTo(isSecurity ? 'security' : normalizedTarget); setVerificationCode('');
      setRetryAt(result.profile?.retryAt ?? Date.now() + 60_000); setNow(Date.now()); setNotice(t('profileCodeSent'));
    }
  };
  const save = async () => {
    if (field === 'displayName') { await request({ action: 'updateName', displayName: value }); return; }
    if (!flow.current) return;
    const result = await request(isSecurity ? method === 'password'
      ? { action: 'phoneVerify', flowId: flow.current, method, password, twoFactorCode }
      : { action: 'phoneVerify', flowId: flow.current, method, code: verificationCode }
      : field === 'email' ? { action: 'bindEmail', email: value, code: verificationCode, flowId: flow.current }
        : { action: 'bindPhone', phone: value, code: verificationCode, flowId: flow.current });
    if (isSecurity && active.current) {
      setPassword(''); setTwoFactorCode('');
      if (result) { setVerificationCode(''); setSentTo(''); setRetryAt(0); }
    }
  };
  const unavailable = field === 'phone' && progress.phoneAvailable === false;
  const platformOnly = (field === 'email' && progress.emailCaptchaRequired) || error === 'captchaRequired';
  const ready = field === 'displayName' ? Boolean(value.trim()) && Array.from(value.trim()).length <= 20
    : isSecurity ? method === 'password' ? Boolean(password) && (!twoFactorCode || /^\d{6}$/.test(twoFactorCode))
      : sentTo === 'security' && /^\d{6}$/.test(verificationCode)
      : Boolean(normalizedTarget) && sentTo === normalizedTarget && /^\d{6}$/.test(verificationCode);
  const showFields = !unavailable && !platformOnly && (field === 'displayName' || Boolean(progress.flowId));
  const retry = async () => {
    if (field === 'displayName') return;
    setPassword(''); setTwoFactorCode(''); setSentTo(''); setVerificationCode(''); setRetryAt(0);
    setProgress({}); await request({ action: 'begin', field });
  };

  return <form ref={form} tabIndex={-1} className="platform-profile-editor" aria-label={t('profileEditField').replace('{field}', t(field === 'displayName' ? 'maasDisplayName' : field === 'email' ? 'profileEmail' : 'profilePhone'))}
    aria-busy={busy} onSubmit={event => { event.preventDefault(); void save(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!locked.current) onCancel(); }
    }}>
    {busy && !showFields && <p role="status">{t('loading')}</p>}
    {unavailable && <p>{t('profileSMSDisabled')}</p>}
    {platformOnly && <p>{t('profileCaptchaHint')}</p>}
    {showFields && <>
      {isSecurity && <>
        <p>{t('profileSecurityHint')}</p>
        <div className="platform-profile-methods" role="group" aria-label={t('profileSecurity')}>
          {(['password', ...(progress.phoneVerified ? ['sms'] : [])] as const).map(item => <button type="button" key={item}
            disabled={busy} aria-pressed={method === item} onClick={() => { setMethod(item as 'password' | 'sms'); setError(''); }}>
            {t(item === 'password' ? 'profilePasswordMethod' : 'profilePhoneMethod')}
          </button>)}
        </div>
      </>}
      {field === 'displayName' && <label><span className="sr-only">{t('maasDisplayName')}</span><input value={value} disabled={busy} onChange={event => setValue(event.target.value)} placeholder={t('profileNameHint')} autoComplete="nickname" /></label>}
      {isSecurity && method === 'password' ? <>
        <label>{t('profileCurrentPassword')}<input type="password" value={password} disabled={busy} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
        <label>{t('profileTwoFactor')}<input value={twoFactorCode} disabled={busy} onChange={event => setTwoFactorCode(event.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" /></label>
      </> : field !== 'displayName' && <>
        {!isSecurity && <label>{t(field === 'email' ? 'profileNewEmail' : 'profileNewPhone')}<input type={field === 'email' ? 'email' : 'tel'} value={value} disabled={busy}
          maxLength={field === 'email' ? 50 : 32} autoComplete={field === 'email' ? 'email' : 'tel'}
          onChange={event => { setValue(event.target.value); setVerificationCode(''); }} /></label>}
        <label>{t('profileCode')}<span className="platform-profile-code"><input value={verificationCode} disabled={busy} inputMode="numeric" maxLength={6}
          onChange={event => setVerificationCode(event.target.value)} autoComplete="one-time-code" />
          <button type="button" disabled={busy || remaining > 0 || (!isSecurity && !normalizedTarget)} onClick={() => { void sendCode(); }}>
            {remaining > 0 ? t('profileResend').replace('{seconds}', String(remaining)) : t('profileSendCode')}
          </button></span></label>
      </>}
    </>}
    {error && <p role="alert" className="text-error">{t(`profileError_${error}`)}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="platform-profile-editor-actions">
      <button type="button" className="platform-profile-cancel" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
      {(!progress.flowId && field !== 'displayName' && !busy) || error === 'expired' ? <button type="button" disabled={busy} onClick={() => { void retry(); }}>{t('profileRestart')}</button> : null}
      {(platformOnly || unavailable) && <button type="button" disabled={busy} onClick={() => { void request({ action: 'openPlatform' }); }}>{t('profileOpenPlatform')}</button>}
      {showFields && <button type="submit" className="platform-profile-save" disabled={busy || !ready}>{t(busy ? 'loading' : isSecurity ? 'profileContinue' : 'profileSave')}</button>}
    </div>
  </form>;
}
