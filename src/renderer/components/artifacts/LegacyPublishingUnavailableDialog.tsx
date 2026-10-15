import { useId, useRef } from 'react';

import { i18nService } from '@/services/i18n';

import PublishingRestrictionDialogShell from './PublishingRestrictionDialogShell';

interface LegacyPublishingUnavailableDialogProps {
  onClose: () => void;
}

const LegacyPublishingUnavailableDialog = ({ onClose }: LegacyPublishingUnavailableDialogProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <PublishingRestrictionDialogShell
      titleId={titleId}
      descriptionId={descriptionId}
      onClose={onClose}
      initialFocusRef={closeButtonRef}
    >
      <div className="p-6">
        <h2 id={titleId} className="pr-10 text-base font-semibold text-foreground">
          {i18nService.t('legacyPublishingUnavailableTitle')}
        </h2>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-secondary">
          {i18nService.t('legacyPublishingUnavailableMessage')}
        </p>
        <div className="mt-5 flex justify-end">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-raised"
          >
            {i18nService.t('close')}
          </button>
        </div>
      </div>
    </PublishingRestrictionDialogShell>
  );
};

export default LegacyPublishingUnavailableDialog;
