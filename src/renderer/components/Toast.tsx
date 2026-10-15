import { CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/20/solid';
import { ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import React from 'react';

/**
 * Payload accepted by the global `app:showToast` event. Plain strings remain
 * supported; pass an object to attach an action button (e.g. "Show in Folder"
 * after an export completes).
 */
export interface ToastEventDetail {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'info' | 'error' | 'success';
}

interface ToastProps {
  message: string;
  closeLabel: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  tone?: 'info' | 'error' | 'success';
}

const Toast: React.FC<ToastProps> = ({ message, closeLabel, actionLabel, onAction, onClose, tone = 'info' }) => {
  const Icon = tone === 'error' ? ExclamationTriangleIcon : tone === 'success' ? CheckCircleIcon : InformationCircleIcon;
  return (
    <div className="pointer-events-none fixed left-1/2 top-1/2 z-[10000] w-max max-w-full -translate-x-1/2 -translate-y-1/2 px-4">
      <div
        className="pointer-events-auto w-fit max-w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border-subtle bg-surface px-3.5 py-2.5 text-foreground shadow-elevated animate-scale-in"
        role={tone === 'error' ? 'alert' : 'status'}
        aria-live={tone === 'error' ? 'assertive' : 'polite'}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div aria-hidden="true" className={`shrink-0 rounded-lg p-1.5 ${tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-primary-muted text-primary'}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 text-sm font-medium leading-snug [overflow-wrap:anywhere]">
            {message}
          </div>
          {actionLabel && onAction && (
            <button
              onClick={() => {
                onAction();
                onClose?.();
              }}
              className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary-muted"
            >
              {actionLabel}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="shrink-0 text-secondary hover:text-foreground rounded-full p-1 hover:bg-surface-raised transition-colors"
              aria-label={closeLabel}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Toast;
