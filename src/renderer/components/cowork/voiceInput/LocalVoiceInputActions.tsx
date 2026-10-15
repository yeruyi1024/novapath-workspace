import { i18nService } from '../../../services/i18n';
import type { GatewayVoicePhase } from '../../../services/voiceInput/gatewayVoiceSession';

interface Props {
  phase: GatewayVoicePhase;
  hasError: boolean;
  onCancel: () => void;
  onFinish: () => void;
}

export default function LocalVoiceInputActions({ phase, hasError, onCancel, onFinish }: Props) {
  return <>
    <button type="button" onClick={onCancel}
      className="rounded-lg px-2.5 py-1.5 text-xs text-secondary hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      {i18nService.t(hasError ? 'close' : 'cancel')}
    </button>
    {phase === 'recording' && <button type="button" onClick={onFinish}
      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      {i18nService.t('gatewayVoiceStop')}
    </button>}
  </>;
}
