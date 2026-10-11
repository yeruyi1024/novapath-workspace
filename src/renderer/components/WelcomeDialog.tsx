import React from 'react';

import { i18nService } from '../services/i18n';

interface WelcomeDialogProps {
  onCustomModel: () => void;
  onContinue: () => void;
}

const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ onCustomModel, onContinue }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-background p-8">
    <div className="w-full max-w-md py-12">
      <img src="logo.svg" alt="" className="mb-10 h-12 w-12" />
      <p className="mb-3 text-sm font-medium text-secondary">{i18nService.t('productName')}</p>
      <h1 className="text-3xl font-medium tracking-tight text-foreground">{i18nService.t('gatewaySetup')}</h1>
      <p className="mt-4 text-sm leading-7 text-secondary">{i18nService.t('gatewaySetupHint')}</p>
      <button type="button" onClick={onCustomModel}
        className="mt-10 w-full rounded-xl bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
        {i18nService.t('gatewaySetup')}
      </button>
      <button type="button" onClick={onContinue}
        className="mt-3 w-full rounded-xl px-5 py-3 text-sm text-secondary transition-colors hover:bg-surface-raised hover:text-foreground">
        {i18nService.t('skip')}
      </button>
      <p className="mt-16 text-xs text-muted">{i18nService.t('workspaceLocalHint')}</p>
    </div>
  </div>
);

export default WelcomeDialog;
