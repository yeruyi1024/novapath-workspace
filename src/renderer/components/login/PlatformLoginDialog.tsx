import { ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useId, useRef } from 'react';

import { i18nService } from '../../services/i18n';
import { useMaasAccount } from '../../services/maasAccount';
import Modal from '../common/Modal';
import PlatformLoginForm from './PlatformLoginForm';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function PlatformLoginDialog({ onClose, onSuccess }: Props) {
  const accountState = useMaasAccount();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const t = (key: string) => i18nService.t(key);

  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  const trapFocus = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]');
    if (!items?.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
      event.preventDefault(); first.focus();
    }
  };

  return <Modal onClose={onClose} onEscape={onClose}
    overlayClassName="fixed inset-0 z-[10060] flex items-center justify-center overflow-y-auto bg-black/30 p-5 backdrop-blur-sm"
    className="platform-login-dialog non-draggable relative w-full max-w-[440px] rounded-2xl border border-border bg-background p-8 text-foreground shadow-xl">
    <div ref={ref} data-platform-dialog role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={trapFocus} className="outline-none">
      <button type="button" onClick={onClose} aria-label={t('close')} className="absolute right-4 top-4 rounded-lg p-2 text-secondary hover:bg-surface-raised focus-visible:outline focus-visible:outline-2">
        <XMarkIcon className="h-5 w-5" />
      </button>
      <div className="mb-7 flex items-center gap-3"><img src="logo.svg" alt="" className="h-10 w-10" /><span className="text-sm font-semibold">{t('productName')}</span></div>
      <p className="platform-login-eyebrow text-primary">{t('maasWelcomeBack')}</p>
      <h2 id={titleId} className="text-2xl font-semibold tracking-tight">{t('maasLoginTitle')}</h2>
      <p className="mt-3 text-sm leading-6 text-secondary">{t('maasInlineLoginHint')}</p>
      <PlatformLoginForm origin={accountState.origin} onSuccess={() => { onSuccess?.(); onClose(); }} />
      <div className="platform-login-security"><ShieldCheckIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p>{t('maasLoginSecurity')}</p></div>
    </div>
  </Modal>;
}
