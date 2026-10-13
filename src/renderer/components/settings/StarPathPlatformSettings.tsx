import { EyeIcon, EyeSlashIcon, KeyIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { PlatformProviderConfig } from '../../services/starpathPlatform';

interface Props {
  provider: PlatformProviderConfig;
  onChange: (provider: PlatformProviderConfig) => void;
  disabled?: boolean;
}

export default function StarPathPlatformSettings({ provider, onChange, disabled }: Props) {
  const [showKey, setShowKey] = useState(false);
  const t = (key: string) => i18nService.t(key);
  return <section className="settings-platform-page" aria-label={t('starpathPlatformTitle')}>
    <div className="settings-platform-summary">
      <div className="flex items-center gap-3">
        <span className="settings-platform-key-icon"><KeyIcon className="h-6 w-6" aria-hidden="true" /></span>
        <div><h4 className="text-base font-semibold text-foreground">{t('starpathPlatformTitle')}</h4>
          <p className="mt-1 text-xs text-secondary">{t('starpathPlatformHint')}</p></div>
      </div>
    </div>
    <div className="settings-platform-fields">
      <div>
      <label htmlFor="starpath-api-key" className="settings-field-label">{t('starpathApiKey')}</label>
      <div className="relative">
        <input id="starpath-api-key" type={showKey ? 'text' : 'password'} value={provider.apiKey}
          disabled={disabled} placeholder={t('starpathKeyPlaceholder')} autoComplete="off" spellCheck={false}
          onChange={event => onChange({ ...provider, apiKey: event.target.value })} className="settings-field w-full pr-11" />
        <button type="button" onClick={() => setShowKey(value => !value)} aria-label={t(showKey ? 'starpathHideKey' : 'starpathShowKey')}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded text-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2">
          {showKey ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
        </button>
      </div>
      </div>
      <p className="text-xs leading-5 text-secondary">{t('starpathKeySetupHint')}</p>
    </div>
    <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-secondary">{t('starpathSaveKeyHint')}</p>
  </section>;
}
