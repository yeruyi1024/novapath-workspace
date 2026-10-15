import React from 'react';

import { i18nService } from '../services/i18n';
import ExclamationTriangleIcon from './icons/ExclamationTriangleIcon';
import XMarkIcon from './icons/XMarkIcon';

interface ErrorMessageProps {
  message: string;
  onClose?: () => void;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onClose, title, actionLabel, onAction, className = 'm-3' }) => {
  return (
    <div role="alert" className={`flex min-w-0 items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3.5 text-foreground ${className}`}>
      <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <ExclamationTriangleIcon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {title && <p className="text-sm font-semibold leading-5">{title}</p>}
        <p className={`${title ? 'mt-1 text-secondary' : 'text-foreground'} text-sm leading-6`}>{message}</p>
        {actionLabel && onAction && <button type="button" onClick={onAction} className="mt-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{actionLabel}</button>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={i18nService.t('close')}
          className="shrink-0 rounded-lg p-1 text-secondary transition-colors hover:bg-destructive/10 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
