import './platformAccount.css';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useId, useSyncExternalStore } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import PlatformAccountDetails from './PlatformAccountDetails';
import { usePlatformDialogFocus } from './usePlatformDialogFocus';

interface Props { account: MaasAccount; onClose: () => void }

export default function PlatformAccountDialog({ account, onClose }: Props) {
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const { dialogRef, trapFocus } = usePlatformDialogFocus();
  const id = useId();
  const t = (key: string) => i18nService.t(key);
  return <Modal onClose={onClose} onEscape={onClose}
    overlayClassName="platform-account-overlay non-draggable"
    className="platform-account-dialog platform-profile-dialog">
    <div ref={dialogRef} data-platform-dialog role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} onKeyDown={trapFocus} className="platform-account-dialog-content">
      <header className="platform-account-header">
        <div className="flex min-w-0 items-center gap-3">
          <img src="logo.svg" alt="" className="h-8 w-8 shrink-0" />
          <div><p className="text-[11px] font-medium text-secondary">{t('productName')}</p><h2 id={`${id}-title`} className="mt-0.5 text-base font-semibold">{t('maasProfileTitle')}</h2></div>
        </div>
        <button type="button" onClick={onClose} aria-label={t('close')} className="platform-account-icon-button"><XMarkIcon aria-hidden="true" className="h-5 w-5" /></button>
      </header>
      <PlatformAccountDetails account={account} onClose={onClose} />
    </div>
  </Modal>;
}
