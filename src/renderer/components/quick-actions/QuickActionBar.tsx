import React from 'react';

import type { LocalizedQuickAction } from '../../types/quickAction';
import FileTypeIcon from '../icons/fileTypes/FileTypeIcon';

interface QuickActionBarProps {
  actions: LocalizedQuickAction[];
  disabled?: boolean;
  selectedActionId?: string | null;
  onActionSelect: (actionId: string) => void;
}

const QuickActionBar: React.FC<QuickActionBarProps> = ({ actions, selectedActionId, onActionSelect, disabled }) => {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div data-skin-quick-actions="true" className="flex flex-wrap items-center justify-center gap-2.5">
      {actions.map((action) => {
        const isSelected = action.id === selectedActionId;

        return (
          <button
            key={action.id}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onActionSelect(action.id)}
            className={`workspace-office-action group flex min-h-9 items-center gap-2 rounded-lg border px-3 py-2 text-[12px] leading-4 font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected
                ? 'border-primary/30 bg-primary-muted text-primary'
                : 'border-border-subtle bg-surface text-secondary hover:border-border hover:bg-surface-raised hover:text-foreground'
            }`}
          >
            <span aria-hidden="true" className="shrink-0">
              <FileTypeIcon
                fileName={`document.${action.skillMapping}`}
                className="h-4 w-4"
                monochrome={false}
              />
            </span>
            <span className="tracking-tight">{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActionBar;
