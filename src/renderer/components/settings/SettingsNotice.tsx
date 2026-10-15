import { ExclamationCircleIcon, InformationCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

import { i18nService } from '../../services/i18n';

interface Props {
  message: string;
  onClose: () => void;
  error?: boolean;
}

export default function SettingsNotice({ message, onClose, error }: Props) {
  const Icon = error ? ExclamationCircleIcon : InformationCircleIcon;
  return <div role={error ? 'alert' : 'status'} className={`settings-notice ${error ? 'settings-notice-error' : ''}`}>
    <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
    <p className="min-w-0 flex-1 break-words">{message}</p>
    <button type="button" onClick={onClose} aria-label={i18nService.t('close')} className="settings-icon-button">
      <XMarkIcon aria-hidden="true" className="h-4 w-4" />
    </button>
  </div>;
}
