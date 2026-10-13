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
    <div data-skin-quick-actions="true" className="flex flex-wrap items-center justify-center gap-2">
      {actions.map((action) => {
        const isSelected = action.id === selectedActionId;

        return (
          <button
            key={action.id}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onActionSelect(action.id)}
            className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-xs leading-5 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isSelected
                ? 'border-primary/30 bg-primary-muted text-primary'
                : 'border-transparent bg-transparent text-secondary hover:border-border-subtle hover:bg-surface-raised hover:text-foreground'
            }`}
          >
            <span aria-hidden="true">
              <FileTypeIcon
                fileName={`document.${action.skillMapping}`}
                className="h-4 w-4 transition-colors"
                monochrome={!isSelected}
              />
            </span>
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default QuickActionBar;
