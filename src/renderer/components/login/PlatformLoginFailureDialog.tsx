import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useId } from 'react';

import { i18nService } from '../../services/i18n';
import Modal from '../common/Modal';
import { usePlatformDialogFocus } from './usePlatformDialogFocus';

export default function PlatformLoginFailureDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const { dialogRef, trapFocus } = usePlatformDialogFocus();
  const titleId = useId();
  const descriptionId = useId();
  return <Modal onClose={onClose} onEscape={onClose}
    overlayClassName="fixed inset-0 z-[10070] flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm"
    className="non-draggable w-full max-w-sm rounded-2xl border border-border bg-surface p-6 text-foreground shadow-2xl">
    <div ref={dialogRef} data-platform-dialog role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
      tabIndex={-1} className="outline-none" onKeyDown={event => { if (event.key === 'Tab') event.stopPropagation(); trapFocus(event); }}>
      <div aria-hidden="true" className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><ExclamationTriangleIcon className="h-5 w-5" /></div>
      <h2 id={titleId} className="text-base font-semibold">{i18nService.t('maasLoginIssueTitle')}</h2>
      <p id={descriptionId} className="mt-2 text-sm leading-6 text-secondary [overflow-wrap:anywhere]">{message}</p>
      <div className="mt-6 flex justify-end"><button type="button" onClick={onClose}
        className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{i18nService.t('confirm')}</button></div>
    </div>
  </Modal>;
}
