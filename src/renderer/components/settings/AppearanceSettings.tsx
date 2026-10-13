import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';

import { PRODUCT } from '../../../shared/product';
import { FontPreferences } from '../../config';
import { i18nService } from '../../services/i18n';

interface Props {
  mode: 'light' | 'dark' | 'system';
  disabled: boolean;
  onSelect: (mode: Props['mode']) => void;
  uiFontSize: number;
  codeFontSize: number;
  onUiFontSizeChange: (value: number) => void;
  onCodeFontSizeChange: (value: number) => void;
}

export default function AppearanceSettings(props: Props) {
  return (
    <div className="settings-appearance-page space-y-8">
      <section className="settings-appearance-section">
        <h4 className="settings-section-title">{i18nService.t('starpathColorMode')}</h4>
        <div className="settings-theme-grid" role="group" aria-label={i18nService.t('starpathColorMode')}>
          {(['light', 'dark', 'system'] as const).map(mode => {
            const Icon = mode === 'light' ? SunIcon : mode === 'dark' ? MoonIcon : ComputerDesktopIcon;
            return (
              <button key={mode} type="button" aria-pressed={props.mode === mode} disabled={props.disabled}
                onClick={() => props.onSelect(mode)} className="settings-theme-choice">
                <span className={`settings-theme-preview settings-theme-preview--${mode}`} aria-hidden="true">
                  <span className="settings-theme-mini-sidebar" />
                  <span className="settings-theme-mini-page"><span /><span /><span /></span>
                  <Icon className="settings-theme-symbol" />
                </span>
                <span className="mt-3 flex items-center justify-between text-sm">
                  {i18nService.t(mode)}<span className="settings-radio-dot" />
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-secondary">{i18nService.t('starpathAppearanceHint')}</p>
      </section>
      <section className="settings-appearance-section">
        <h4 className="settings-section-title">{i18nService.t('starpathTypography')}</h4>
        <div className="settings-typography-layout">
          <div className="settings-typography-controls">
            {([
              { id: 'ui-font-size', title: 'uiFontSize', description: 'uiFontSizeDescription', value: props.uiFontSize,
                min: FontPreferences.UiFontSizeMin, max: FontPreferences.UiFontSizeMax, onChange: props.onUiFontSizeChange },
              { id: 'code-font-size', title: 'codeFontSize', description: 'codeFontSizeDescription', value: props.codeFontSize,
                min: FontPreferences.CodeFontSizeMin, max: FontPreferences.CodeFontSizeMax, onChange: props.onCodeFontSizeChange },
            ]).map(row => (
              <div key={row.id} className="settings-preference-row">
                <div className="min-w-0"><label htmlFor={row.id} className="text-sm text-foreground">{i18nService.t(row.title)}</label>
                  <p id={`${row.id}-description`} className="mt-1 text-xs leading-5 text-secondary">{i18nService.t(row.description)}</p></div>
                <div className="flex shrink-0 items-center gap-2">
                  <input id={row.id} type="number" min={row.min} max={row.max} value={row.value}
                    aria-describedby={`${row.id}-description`} className="settings-field w-16 text-center" onChange={event => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value)) row.onChange(Math.min(row.max, Math.max(row.min, Math.round(value))));
                    }} />
                  <span className="text-xs text-secondary">px</span>
                </div>
              </div>
            ))}
          </div>
          <div className="settings-type-sample" role="region" aria-label={i18nService.t('previewTitle')}>
            <div className="settings-type-sample-header" aria-hidden="true">
              <span className="settings-type-sample-dot" />
              <span className="settings-type-sample-dot" />
              <span className="settings-type-sample-dot" />
              <span className="settings-type-sample-title">{PRODUCT.englishName} · {i18nService.t('previewTitle')}</span>
            </div>
            <div className="settings-type-sample-body">
              <p style={{ fontSize: props.uiFontSize }}>{i18nService.t('starpathSettingsReadingSample')}</p>
              <code style={{ fontSize: props.codeFontSize }}>{PRODUCT.englishName} / workspace</code>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
