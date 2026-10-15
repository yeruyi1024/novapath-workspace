import { XMarkIcon } from '@heroicons/react/24/outline';
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
    overlayClassName="fixed inset-0 z-[10060] flex items-center justify-center overflow-y-auto bg-black/40 p-5 backdrop-blur-md"
    className="platform-login-dialog non-draggable relative w-full max-w-[440px] rounded-2xl border border-border bg-surface p-8 text-foreground shadow-2xl">
    <div ref={ref} data-platform-dialog role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={trapFocus} className="outline-none">
      <button type="button" onClick={onClose} aria-label={t('close')} className="absolute right-4 top-4 rounded-xl p-2 text-secondary hover:bg-surface-raised hover:text-foreground focus-visible:outline focus-visible:outline-2 transition-colors">
        <XMarkIcon className="h-5 w-5" />
      </button>
      <div className="flex flex-col items-center text-center">
        <img src="logo.svg" alt="" className="mb-4 h-11 w-11 select-none rounded-xl shadow-sm" draggable={false} />
        <h2 id={titleId} className="text-xl font-semibold tracking-tight">{t('maasLoginCardTitle')}</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-secondary">{t('maasLoginCardSubtitle')}</p>
      </div>
      <PlatformLoginForm origin={accountState.origin} onSuccess={() => { onSuccess?.(); onClose(); }} />
      <p className="mt-6 text-center text-[13px] leading-5 tracking-wide text-muted">{t('maasLoginTagline')}</p>
    </div>
  </Modal>;
}
