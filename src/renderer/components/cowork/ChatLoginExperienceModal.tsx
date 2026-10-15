import '../login/loginIntroduction.css';

import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useId, useRef } from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';

interface ChatLoginExperienceModalProps {
  loginPending: boolean;
  onClose: () => void;
  onStart: () => void;
}

const ChatLoginExperienceModal: React.FC<ChatLoginExperienceModalProps> = ({
  loginPending,
  onClose,
  onStart,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    if (!buttons?.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <Modal
      onClose={onClose}
      onEscape={onClose}
      overlayClassName="login-introduction-overlay draggable fixed inset-0 z-[10050] flex items-center justify-center pt-6"
      className="login-introduction-card non-draggable relative overflow-hidden rounded-2xl bg-surface text-foreground border border-border shadow-2xl"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="login-introduction-content grid h-full place-items-center outline-none"
        onKeyDown={handleKeyDown}
      >
        <div className="login-introduction-welcome flex min-w-0 flex-col items-center justify-center text-center">
          <img
            src="logo.svg"
            alt=""
            width={44}
            height={44}
            className="mb-5 select-none rounded-xl shadow-sm"
            draggable={false}
          />
          <h1 id={titleId} className="login-introduction-heading">
            {i18nService.t('chatLoginExperienceTitlePrefix')} {i18nService.t('productName')}
          </h1>
          <p className="login-introduction-tagline">{i18nService.t('loginIntroductionTagline')}</p>
          <div className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <SparklesIcon className="h-3.5 w-3.5" />
            <span>{i18nService.t('loginIntroductionPromo')}</span>
          </div>
          <button
            type="button"
            onClick={onStart}
            disabled={loginPending}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover transition-all disabled:cursor-wait disabled:opacity-60 active:scale-[0.99] motion-reduce:transition-none"
          >
            {i18nService.t(loginPending ? 'chatLoginExperienceStarting' : 'sidebarLoginNow')}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={i18nService.t('loginIntroductionSkip')}
          title={i18nService.t('loginIntroductionSkip')}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-xl text-secondary transition-colors hover:bg-surface-raised hover:text-foreground motion-reduce:transition-none"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </Modal>
  );
};

export default ChatLoginExperienceModal;
