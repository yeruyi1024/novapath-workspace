import { ArrowPathIcon, ChatBubbleLeftRightIcon, DocumentTextIcon, FolderIcon, ShieldCheckIcon, SparklesIcon } from '@heroicons/react/24/outline';
import React from 'react';

import { i18nService } from '../services/i18n';
import PlatformLoginForm from './login/PlatformLoginForm';

interface WelcomeDialogProps {
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
}

const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ pending, error, onRetry }) => {
  const t = (key: string) => i18nService.t(key);
  return <div className="draggable platform-welcome relative min-h-0 flex-1 overflow-y-auto text-foreground">
    <div className="platform-welcome-shell mx-auto min-h-full">
      <header className="platform-welcome-brand flex items-center gap-3">
        <img src="logo.svg" alt="" className="h-10 w-10" />
        <span className="text-lg font-semibold tracking-tight">{t('productName')}</span>
      </header>
      <div className="non-draggable platform-welcome-content">
        <section className="platform-welcome-story">
          <p className="platform-welcome-badge"><SparklesIcon aria-hidden="true" className="h-3.5 w-3.5" />{t('maasWelcomeBadge')}</p>
          <h1 className="platform-welcome-title"><span className="block">{t('maasWelcomeTitle')}</span><span className="block text-primary">{t('maasWelcomeTitleResult')}</span></h1>
          <p className="platform-welcome-hint text-secondary">{t('maasWelcomeHint')}</p>
          <div className="platform-welcome-preview">
          <div className="platform-welcome-preview-header"><div aria-hidden="true" className="platform-welcome-preview-dots"><span /><span /><span /></div><p>{t('maasWelcomePreview')}</p></div>
          <div className="platform-welcome-features">
            {[
              { icon: FolderIcon, title: 'maasWelcomeProjects', hint: 'maasWelcomeProjectsHint' },
              { icon: DocumentTextIcon, title: 'maasWelcomeFiles', hint: 'maasWelcomeFilesHint' },
              { icon: ChatBubbleLeftRightIcon, title: 'maasWelcomeLocal', hint: 'maasWelcomeLocalHint' },
            ].map(({ icon: Icon, title, hint }) => <div key={title} className="platform-welcome-feature">
              <span className="platform-welcome-feature-icon"><Icon aria-hidden="true" className="h-5 w-5" /></span>
              <div><p className="text-sm font-medium">{t(title)}</p><p className="mt-1 text-xs leading-5 text-secondary">{t(hint)}</p></div>
            </div>)}
          </div>
          <div className="platform-welcome-file-types">{['maasWelcomeDocument', 'maasWelcomeSpreadsheet', 'maasWelcomePresentation'].map(key => <span key={key}>{t(key)}</span>)}</div>
          </div>
        </section>
        <section className="platform-login-card" aria-labelledby="platform-welcome-login-title">
          <p className="platform-login-eyebrow text-primary">{t('maasWelcomeBack')}</p>
          <h2 id="platform-welcome-login-title" className="text-2xl font-semibold tracking-tight">{t('maasLoginTitle')}</h2>
          <p className="mt-3 text-sm leading-6 text-secondary">{t('maasInlineLoginHint')}</p>
          {pending ? <p role="status" className="platform-login-loading text-secondary"><ArrowPathIcon aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />{t('maasCheckingSession')}</p> : <>
            {error && <div className="mt-4 rounded-lg border border-border p-3">
              <p role="alert" className="text-xs leading-5 text-error">{error}</p>
              <button type="button" onClick={onRetry} className="mt-2 rounded py-1 text-xs text-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2">{t('maasRetrySession')}</button>
            </div>}
            <PlatformLoginForm onSuccess={() => { /* The session store opens the workspace after validated login. */ }} />
          </>}
          <div className="platform-login-security"><ShieldCheckIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><p>{t('maasLoginSecurity')}</p></div>
        </section>
      </div>
    </div>
  </div>;
};

export default WelcomeDialog;
