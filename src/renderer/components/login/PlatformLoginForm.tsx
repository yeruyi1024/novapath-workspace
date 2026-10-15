import './platformLogin.css';

import { ArrowPathIcon, ArrowRightIcon, CheckCircleIcon, ClockIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState } from 'react';

import { DEFAULT_MAAS_ORIGIN, type MaasLoginInput, type MaasResult } from '../../../shared/auth/maas';
import { i18nService } from '../../services/i18n';
import { applyMaasResult } from '../../services/maasAccount';
import PlatformLoginFailureDialog from './PlatformLoginFailureDialog';
import { createPlatformSmsChallenge, isPlatformSmsChallengeValid, maskedSmsPhone, type PlatformSmsChallenge, smsRetrySeconds } from './platformSmsChallenge';

interface Props {
  origin?: string;
  onSuccess: () => void;
  initialError?: string;
}

export default function PlatformLoginForm({ origin = DEFAULT_MAAS_ORIGIN, onSuccess, initialError }: Props) {
  const t = (key: string) => i18nService.t(key);
  const id = useId();
  const [options, setOptions] = useState<MaasResult['loginOptions']>();
  const [retry, setRetry] = useState(0);
  const [statusPending, setStatusPending] = useState(true);
  const [method, setMethod] = useState<'password' | 'sms'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<PlatformSmsChallenge>();
  const [flow, setFlow] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const cooldown = smsRetrySeconds(retryAt, now);
  const [sendingSMS, setSendingSMS] = useState(false);
  const requestGeneration = useRef(0);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [dismissedInitialError, setDismissedInitialError] = useState<string>();
  const active = useRef(true);
  const busy = useRef(false);
  const inputClass = 'platform-login-input';
  const SmsNoticeIcon = challenge && challenge.expiresAt <= now ? ClockIcon : CheckCircleIcon;
  const completeLogin = () => {
    window.dispatchEvent(new CustomEvent('app:showToast', {
      detail: { message: t('maasLoginSuccess'), tone: 'success' },
    }));
    onSuccess();
  };
  const failureMessage = error || (initialError !== dismissedInitialError ? initialError : '');
  const failureDialog = failureMessage ? <PlatformLoginFailureDialog message={failureMessage} onClose={() => {
    setError(''); setDismissedInitialError(initialError);
  }} /> : null;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    let current = true;
    requestGeneration.current += 1;
    setStatusPending(true); setOptions(undefined); setError('');
    setPassword(''); setShowPassword(false); setFlow(''); setCode(''); setChallenge(undefined);
    void window.electron.maas.status(origin).then(result => {
      if (!current) return;
      if (!result.success || !result.loginOptions) { setError(i18nService.t(`maasError_${result.error ?? 'network'}`)); return; }
      setOptions(result.loginOptions);
      setMethod(result.loginOptions.password ? 'password' : 'sms');
    }).catch(() => { if (current) setError(i18nService.t('maasError_network')); })
      .finally(() => { if (current) setStatusPending(false); });
    return () => { current = false; };
  }, [origin, retry]);

  useEffect(() => {
    const deadline = Math.max(retryAt, challenge?.expiresAt ?? 0);
    let timer: number | undefined;
    const update = () => {
      const time = Date.now();
      setNow(time);
      if (time >= deadline && timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    };
    update();
    if (deadline <= Date.now()) return;
    timer = window.setInterval(update, 1000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [retryAt, challenge?.expiresAt]);

  useEffect(() => { if (challenge) codeInputRef.current?.focus(); }, [challenge]);

  const sendSMS = async () => {
    if (busy.current || smsRetrySeconds(retryAt, Date.now()) > 0) return;
    if (!/^1[3-9]\d{9}$/.test(phone)) { setError(t('maasPhoneInvalid')); return; }
    const generation = requestGeneration.current;
    busy.current = true; setPending(true); setSendingSMS(true); setError('');
    try {
      const result = await window.electron.maas.sendSMS({ origin, phone });
      if (!active.current || requestGeneration.current !== generation) return;
      const receivedAt = Date.now();
      const nextChallenge = result.success ? createPlatformSmsChallenge(result.smsChallenge, origin, phone, receivedAt) : undefined;
      if (nextChallenge) {
        setNow(receivedAt); setChallenge(nextChallenge); setRetryAt(nextChallenge.retryAt); setCode('');
      } else setError(t(`maasError_${result.error ?? 'invalidResponse'}`));
    } catch { if (active.current && requestGeneration.current === generation) setError(t('maasError_network')); }
    finally { busy.current = false; if (active.current) { setPending(false); setSendingSMS(false); } }
  };

  const submit = async () => {
    if (busy.current) return;
    let input: MaasLoginInput;
    if (flow) input = { origin, method: 'twofa', flowToken: flow, code };
    else if (method === 'password') input = { origin, method: 'password', username: username.trim(), password };
    else {
      if (!isPlatformSmsChallengeValid(challenge, origin, phone, Date.now()) || !challenge) { setError(t('maasSMSCodeNeeded')); return; }
      input = { origin, method: 'sms', challengeToken: challenge.token, code };
    }
    busy.current = true; setPending(true); setError('');
    try {
      const result = await window.electron.maas.login(input);
      if (result.success && !result.twoFactorFlow && result.snapshot.account) applyMaasResult(result);
      if (!active.current) return;
      if (result.success && result.twoFactorFlow) {
        setFlow(result.twoFactorFlow); setPassword(''); setShowPassword(false); setCode('');
      } else if (result.success && result.snapshot.account) {
        setPassword(''); setShowPassword(false); setCode(''); setFlow(''); setChallenge(undefined);
        completeLogin();
      } else setError(t(`maasError_${result.error ?? 'invalidResponse'}`));
    } catch { if (active.current) setError(t('maasError_network')); }
    finally { busy.current = false; if (active.current) setPending(false); }
  };

  if (statusPending) return <p role="status" className="platform-login-loading text-secondary"><ArrowPathIcon aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />{t('maasLoadingLogin')}</p>;
  if (!options) return <div className="py-5">{failureDialog}<button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-raised">{t('retry')}</button></div>;

  if (options.captcha || (!options.password && !options.sms)) return <div className="py-5">
    <p className="text-sm leading-6 text-secondary">{t('maasPlatformVerification')}</p>

    {failureDialog}
    <button type="button" disabled={pending} onClick={() => {
      if (busy.current) return;
      busy.current = true; setPending(true);
      void window.electron.maas.openLogin(origin).then(result => {
        if (result.success) applyMaasResult(result);
        if (!active.current) return;
        if (result.success && result.snapshot.account) completeLogin();
        else if (result.error !== 'cancelled') setError(t(`maasError_${result.error ?? 'invalidResponse'}`));
      }).catch(() => { if (active.current) setError(t('maasError_network')); })
        .finally(() => { busy.current = false; if (active.current) setPending(false); });
    }} className="mt-5 w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50">{t(pending ? 'maasLoginWaiting' : 'maasLoginContinue')}</button>
  </div>;

  return <form className="platform-login-form mt-6" onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={pending}>
    {!flow && options.password && options.sms && <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1 border border-border/40">
      {(['password', 'sms'] as const).map(item => <button key={item} type="button" aria-pressed={method === item} disabled={pending}
        onClick={() => { setMethod(item); setShowPassword(false); setError(''); setCode(''); }}
        className={`rounded-lg px-3 py-2 text-xs font-semibold transition-all motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${method === item ? 'bg-background text-foreground shadow-sm' : 'text-secondary hover:text-foreground hover:bg-surface/50'}`}>
        {t(item === 'password' ? 'maasPasswordMethod' : 'maasSMSMethod')}
      </button>)}
    </div>}
    {flow ? <div>
      <label htmlFor={`${id}-code`} className="text-xs font-medium text-secondary">{t('maasTwoFactorCode')}</label>
      <input id={`${id}-code`} autoComplete="one-time-code" autoFocus required maxLength={32} value={code} onChange={event => setCode(event.target.value)} disabled={pending} className={inputClass} />
      <p className="mt-2 text-xs leading-5 text-muted">{t('maasTwoFactorHint')}</p>
    </div> : method === 'password' ? <div className="space-y-4">
      <div><label htmlFor={`${id}-username`} className="text-xs font-medium text-secondary">{t('maasUsername')}</label>
        <input id={`${id}-username`} name="username" autoComplete="username" required maxLength={256} value={username} onChange={event => setUsername(event.target.value)} disabled={pending} placeholder={t('maasUsernamePlaceholder')} className={inputClass} /></div>
      <div><div className="flex items-center justify-between gap-2"><label htmlFor={`${id}-password`} className="text-xs font-medium text-secondary">{t('maasPassword')}</label>
        <button type="button" onClick={() => { void window.electron.shell.openExternal(origin + '/forgot-password'); }} className="rounded text-xs text-secondary hover:text-primary hover:underline transition-colors focus-visible:outline focus-visible:outline-2">{t('maasForgotPassword')}</button></div>
        <div className="platform-login-password"><input id={`${id}-password`} name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={1024} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} placeholder={t('maasPasswordPlaceholder')} className={inputClass} />
          <button type="button" disabled={pending} aria-label={t(showPassword ? 'maasHidePassword' : 'maasShowPassword')} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="platform-login-password-toggle">{showPassword ? <EyeSlashIcon aria-hidden="true" className="h-4 w-4" /> : <EyeIcon aria-hidden="true" className="h-4 w-4" />}</button>
        </div></div>
    </div> : <div className="space-y-4">
      <div><label htmlFor={`${id}-phone`} className="text-xs font-medium text-secondary">{t('maasPhone')}</label>
        <input id={`${id}-phone`} type="tel" name="phone" autoComplete="tel-national" required maxLength={11} pattern="1[3-9][0-9]{9}" value={phone} onChange={event => { requestGeneration.current += 1; setPhone(event.target.value); setChallenge(undefined); setCode(''); setError(''); }} disabled={pending} placeholder={t('maasPhonePlaceholder')} className={inputClass} /></div>
      <div><label htmlFor={`${id}-code`} className="text-xs font-medium text-secondary">{t('maasSMSCode')}</label>
        <div className="flex items-center gap-2"><input ref={codeInputRef} id={`${id}-code`} autoComplete="one-time-code" inputMode="numeric" required maxLength={6} pattern="[0-9]{6}" value={code} onChange={event => setCode(event.target.value)} disabled={pending} className={`${inputClass} min-w-0 flex-1`} />
          <button type="button" disabled={pending || cooldown > 0} onClick={() => { void sendSMS(); }} className="platform-login-sms-btn mt-1.5 h-10 min-w-[104px] shrink-0 rounded-[10px] border border-primary/25 bg-primary/10 px-3 text-xs font-medium tabular-nums text-primary hover:bg-primary/15 hover:border-primary/40 disabled:border-border disabled:bg-surface-raised disabled:text-secondary disabled:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{sendingSMS ? t('maasSendingCode') : cooldown > 0 ? t('maasSMSRetryIn').replace('{seconds}', String(cooldown)) : t(challenge ? 'maasResendCode' : 'maasSendCode')}</button></div>
      </div>
    </div>}
    {!flow && method === 'sms' && !challenge && <p className="mt-2.5 text-[11px] leading-[18px] text-muted">{t('maasSMSHint')}</p>}
    {!flow && method === 'sms' && challenge && <div role="status" className="platform-login-sms-notice">
      <SmsNoticeIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{challenge.expiresAt > now ? t('maasSMSSent').replace('{phone}', maskedSmsPhone(challenge.phone)) : t('maasSMSExpired')}</p>
    </div>}
    {failureDialog}
    <button type="submit" disabled={pending} className="platform-login-submit mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-150 disabled:opacity-50 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-[0.99]">
      {pending && !sendingSMS && <ArrowPathIcon aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{t(pending && !sendingSMS ? 'maasSubmitting' : flow ? 'maasVerifyLogin' : 'maasSignIn')}{!pending && <ArrowRightIcon aria-hidden="true" className="h-4 w-4" />}
    </button>
    {flow && <button type="button" disabled={pending} onClick={() => { setFlow(''); setCode(''); setError(''); }} className="mt-3 w-full rounded-xl py-2 text-xs font-medium text-secondary hover:bg-surface-raised hover:text-foreground transition-colors">{t('maasBackToLogin')}</button>}

  </form>;
}
