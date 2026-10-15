import './platformSubscription.css';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useId, useSyncExternalStore } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import PlatformSubscriptions from './PlatformSubscriptions';
import { usePlatformDialogFocus } from './usePlatformDialogFocus';

interface Props { account: MaasAccount; origin: string; onClose: () => void }

export default function PlatformSubscriptionDialog({ account, origin, onClose }: Props) {
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const { dialogRef, trapFocus } = usePlatformDialogFocus();
  const id = useId();
  const t = (key: string) => i18nService.t(key);
  return <Modal onClose={onClose} onEscape={onClose} overlayClassName="platform-account-overlay non-draggable" className="platform-subscription-dialog">
    <div ref={dialogRef} data-platform-dialog role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1} onKeyDown={trapFocus} className="platform-subscription-dialog-content">
      <header className="platform-subscription-dialog-header">
        <h2 id={`${id}-title`}>{t('maasSubscriptionDialogTitle')}</h2>
        <p id={`${id}-description`} className="platform-subscription-dialog-hint">{t('maasSubscriptionDialogHint')}</p>
        <button type="button" onClick={onClose} aria-label={t('close')} className="platform-account-icon-button platform-subscription-close"><XMarkIcon aria-hidden="true" className="h-5 w-5" /></button>
      </header>
      <div className="platform-subscription-dialog-body"><PlatformSubscriptions account={account} origin={origin} /></div>
    </div>
  </Modal>;
}
