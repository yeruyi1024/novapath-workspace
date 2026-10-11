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
    <div className="space-y-8">
      <section>
        <h4 className="settings-section-title">{i18nService.t('starpathColorMode')}</h4>
        <div className="grid grid-cols-3 gap-3" role="group" aria-label={i18nService.t('starpathColorMode')}>
          {(['light', 'dark', 'system'] as const).map(mode => (
            <button key={mode} type="button" aria-pressed={props.mode === mode} disabled={props.disabled}
              onClick={() => props.onSelect(mode)} className="settings-theme-choice">
              <span className={`settings-theme-preview settings-theme-preview--${mode}`} aria-hidden="true">
                <span className="settings-theme-sidebar"><i /><i /><i /></span>
                <span className="settings-theme-canvas"><i /><i /><span /></span>
              </span>
              <span className="mt-3 flex items-center justify-between text-sm">
                {i18nService.t(mode)}<span className="settings-radio-dot" />
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs leading-5 text-secondary">{i18nService.t('starpathAppearanceHint')}</p>
      </section>
      <section>
        <h4 className="settings-section-title">{i18nService.t('starpathTypography')}</h4>
        {([
          { id: 'ui-font-size', title: 'uiFontSize', description: 'uiFontSizeDescription', value: props.uiFontSize,
            min: FontPreferences.UiFontSizeMin, max: FontPreferences.UiFontSizeMax, onChange: props.onUiFontSizeChange },
          { id: 'code-font-size', title: 'codeFontSize', description: 'codeFontSizeDescription', value: props.codeFontSize,
            min: FontPreferences.CodeFontSizeMin, max: FontPreferences.CodeFontSizeMax, onChange: props.onCodeFontSizeChange },
        ]).map(row => (
          <div key={row.id} className="settings-preference-row">
            <div className="min-w-0"><label htmlFor={row.id} className="text-sm text-foreground">{i18nService.t(row.title)}</label>
              <p className="mt-1 text-xs leading-5 text-secondary">{i18nService.t(row.description)}</p></div>
            <div className="flex shrink-0 items-center gap-2">
              <input id={row.id} type="number" min={row.min} max={row.max} value={row.value}
                className="settings-field w-16 text-center" onChange={event => {
                  const value = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(value)) row.onChange(Math.min(row.max, Math.max(row.min, Math.round(value))));
                }} />
              <span className="text-xs text-secondary">px</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
