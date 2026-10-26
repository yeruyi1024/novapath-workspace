import { ClipboardDocumentIcon, EyeIcon, EyeSlashIcon, KeyIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { PlatformProviderConfig } from '../../services/starpathPlatform';

interface Props {
  provider: PlatformProviderConfig;
  disabled?: boolean;
}

/**
 * The platform registers this key for the account as soon as the user signs in,
 * so there is nothing to configure here. It stays hidden until the user asks for
 * it, because most people never need to read or copy it.
 */
export default function StarPathPlatformSettings({ provider, disabled }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = (key: string) => i18nService.t(key);

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(provider.apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return <section className="settings-platform-page" aria-label={t('starpathPlatformTitle')}>
    <div className="settings-platform-summary">
      <div className="flex items-center gap-3">
        <span className="settings-platform-key-icon"><KeyIcon className="h-6 w-6" aria-hidden="true" /></span>
        <div><h4 className="text-base font-semibold text-foreground">{t('starpathPlatformTitle')}</h4>
          <p className="mt-1 text-xs text-secondary">{t('starpathPlatformHint')}</p></div>
      </div>
    </div>
    <div className="settings-platform-fields">
      <p className="text-xs leading-5 text-secondary">
        {provider.apiKey ? t('starpathManagedKeyReady') : t('starpathManagedKeyPending')}
      </p>
      {provider.apiKey && <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled} onClick={() => setRevealed(value => !value)}
          aria-expanded={revealed} className="settings-platform-key-toggle">
          {revealed ? <EyeSlashIcon className="h-4 w-4" aria-hidden="true" /> : <EyeIcon className="h-4 w-4" aria-hidden="true" />}
          {t(revealed ? 'starpathManagedKeyHide' : 'starpathManagedKeyShow')}
        </button>
        {revealed && <button type="button" disabled={disabled} onClick={() => void copyKey()}
          className="settings-platform-key-toggle">
          <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
          {t(copied ? 'starpathManagedKeyCopied' : 'starpathManagedKeyCopy')}
        </button>}
      </div>}
      {revealed && <input id="starpath-api-key" type="text" value={provider.apiKey} readOnly
        aria-label={t('starpathApiKey')} autoComplete="off" spellCheck={false}
        className="settings-field w-full" onFocus={event => event.currentTarget.select()} />}
    </div>
    <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-secondary">{t('starpathManagedKeyHint')}</p>
  </section>;
}
