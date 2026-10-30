import { ArrowPathIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { i18nService } from '../services/i18n';
import PlatformLoginForm from './login/PlatformLoginForm';

interface WelcomeDialogProps {
  origin?: string;
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
}

const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ origin, pending, error, onRetry }) => {
  const t = (key: string) => i18nService.t(key);
  return (
    <div className="draggable platform-welcome relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-foreground">
      <section className="non-draggable platform-login-card w-full max-w-[400px]" aria-labelledby="platform-welcome-login-title">
        <div className="flex flex-col items-center text-center">
          <img src="logo.svg" alt="" className="mb-4 h-11 w-11 select-none rounded-xl shadow-sm" draggable={false} />
          <h1 id="platform-welcome-login-title" className="text-xl font-semibold tracking-tight text-foreground">{t('maasLoginCardTitle')}</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-secondary">{t('maasLoginCardSubtitle')}</p>
        </div>

        {pending ? (
          <p role="status" className="platform-login-loading text-secondary">
            <ArrowPathIcon aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none text-primary" />
            {t('maasCheckingSession')}
          </p>
        ) : (
          <>
            {error && (
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={onRetry}
                  className="text-xs font-medium text-secondary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2"
                >
                  {t('maasRetrySession')}
                </button>
              </div>
            )}
            <PlatformLoginForm origin={origin} initialError={error} onSuccess={() => { /* The session store opens the workspace after validated login. */ }} />
          </>
        )}

      </section>
      <p className="non-draggable text-center text-[13px] leading-5 tracking-wide text-muted">{t('maasLoginTagline')}</p>
    </div>
  );
};

export default WelcomeDialog;
