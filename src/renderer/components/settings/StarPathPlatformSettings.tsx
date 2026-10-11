import { ArrowPathIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

import { PRODUCT } from '../../../shared/product';
import { i18nService } from '../../services/i18n';
import type { PlatformProviderConfig as ProviderConfig } from '../../services/starpathPlatform';
import { getPlatformErrorMessage, normalizePlatformBaseUrl, syncPlatformModels, testPlatformConnection } from '../../services/starpathPlatform';

interface Props {
  provider: ProviderConfig;
  defaultModel: string;
  onChange: (provider: ProviderConfig) => void;
  onDefaultModelChange: (id: string) => void;
}

export default function StarPathPlatformSettings({ provider, defaultModel, onChange, onDefaultModelChange }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; text: string } | null>(null);
  const requestVersion = useRef(0);
  const currentCredentials = useRef('');
  const credentials = `${provider.baseUrl}\n${provider.apiKey}\n${defaultModel}\n${(provider.models ?? []).map(model => model.id).join('\n')}`;
  if (currentCredentials.current !== credentials) {
    currentCredentials.current = credentials;
    requestVersion.current += 1;
  }
  useEffect(() => {
    setFeedback(null);
    setBusy(false);
  }, [credentials]);
  useEffect(() => () => { requestVersion.current += 1; }, []);

  const update = (patch: Partial<ProviderConfig>) => onChange({ ...provider, ...patch });
  const runRequest = async (sync: boolean) => {
    const version = ++requestVersion.current;
    setBusy(true);
    setFeedback(null);
    try {
      const baseUrl = normalizePlatformBaseUrl(provider.baseUrl);
      if (sync) {
        const models = await syncPlatformModels(window.electron.api.fetch, baseUrl, provider.apiKey, provider.models ?? []);
        if (version !== requestVersion.current) return;
        onChange({ ...provider, baseUrl, apiKey: provider.apiKey.trim(), models, enabled: true });
        if (!models.some(model => model.id === defaultModel)) onDefaultModelChange(models[0].id);
        // The model count below is the durable sync result; connection testing is separate.
      } else {
        await testPlatformConnection(window.electron.api.fetch, baseUrl, provider.apiKey, defaultModel);
        if (version !== requestVersion.current) return;
        setFeedback({ success: true, text: i18nService.t('connectionSuccess') });
      }
    } catch (error) {
      if (version !== requestVersion.current) return;
      setFeedback({ success: false, text: getPlatformErrorMessage(error) });
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  };

  const ready = !!provider.baseUrl.trim() && !!provider.apiKey.trim();
  const models = provider.models ?? [];
  return (
    <section aria-label={i18nService.t('starpathPlatformTitle')}>
      <div className="flex flex-wrap items-start justify-between gap-3 pb-6">
        <div className="flex items-center gap-3">
          <img src="logo.svg" alt="" className="h-10 w-10" />
          <div><h4 className="text-base font-semibold text-foreground">{i18nService.t('starpathPlatformTitle')}</h4>
            <p className="mt-1 text-xs text-secondary">{i18nService.t('starpathPlatformHint')}</p></div>
        </div>
        <span className="settings-status">{i18nService.t(provider.enabled && ready && models.length ? 'starpathConfigured' : 'starpathNotConfigured')}</span>
      </div>
      <div className="space-y-5">
        <div>
          <label htmlFor="starpath-base-url" className="settings-field-label">{i18nService.t('starpathGatewayUrl')}</label>
          <input id="starpath-base-url" type="url" value={provider.baseUrl}
            placeholder="https://your-platform.example/v1" autoComplete="off" spellCheck={false}
            onChange={event => update({ baseUrl: event.target.value })} className="settings-field w-full" />
          <p className="mt-2 text-xs leading-5 text-secondary">{i18nService.t('starpathGatewayHint')}</p>
        </div>
        <div>
          <label htmlFor="starpath-api-key" className="settings-field-label">API Key</label>
          <div className="relative">
            <input id="starpath-api-key" type={showKey ? 'text' : 'password'} value={provider.apiKey}
              placeholder={i18nService.t('starpathKeyPlaceholder')} autoComplete="off" spellCheck={false}
              onChange={event => update({ apiKey: event.target.value })} className="settings-field w-full pr-11" />
            <button type="button" onClick={() => setShowKey(value => !value)} aria-label={i18nService.t(showKey ? 'starpathHideKey' : 'starpathShowKey')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground">
              {showKey ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="settings-preference-row">
          <div><p className="text-sm text-foreground">{i18nService.t('starpathAvailableModels')}</p>
            <p className="mt-1 text-xs leading-5 text-secondary">{models.length ? i18nService.t('starpathModelsCount').replace('{count}', String(models.length)) : i18nService.t('starpathModelsEmpty')}</p></div>
          <button type="button" disabled={!ready || busy} onClick={() => void runRequest(true)} className="settings-secondary-button shrink-0">
            <ArrowPathIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />{i18nService.t(busy ? 'starpathRequesting' : 'starpathSyncModels')}
          </button>
        </div>
        <div>
          <label htmlFor="starpath-default-model" className="settings-field-label">{i18nService.t('starpathDefaultModel')}</label>
          <select id="starpath-default-model" value={models.some(model => model.id === defaultModel) ? defaultModel : ''}
            disabled={!models.length} onChange={event => onDefaultModelChange(event.target.value)} className="settings-field w-full">
            <option value="" disabled>{i18nService.t('starpathSelectModel')}</option>
            {models.map(model => <option key={model.id} value={model.id}>{model.name || model.id}</option>)}
          </select>
          <p className="mt-2 text-xs leading-5 text-secondary">{i18nService.t('starpathDefaultModelHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!ready || busy || !models.some(model => model.id === defaultModel)} onClick={() => void runRequest(false)} className="settings-secondary-button">
            {i18nService.t(busy ? 'starpathRequesting' : 'testConnection')}
          </button>
          <label className="ml-auto flex items-center gap-2 text-xs text-secondary">
            <input type="checkbox" checked={provider.enabled} disabled={!ready || !models.length}
              onChange={event => update({ enabled: event.target.checked })} className="accent-primary" />
            {i18nService.t('starpathEnableConnection')}
          </label>
        </div>
        {feedback && <p role="status" className={`rounded-lg border border-border px-3 py-2 text-xs leading-5 ${feedback.success ? 'text-foreground' : 'text-error'}`}>{feedback.text}</p>}
      </div>
      <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-secondary">{i18nService.t('starpathSaveConnectionHint').replace('{brand}', PRODUCT.shortName)}</p>
    </section>
  );
}
