import {
  AcademicCapIcon,
  ArrowRightIcon,
  ChartBarSquareIcon,
  ClipboardDocumentCheckIcon,
  DocumentTextIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  SparklesIcon,
  Square3Stack3DIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import { RootState } from '../../store';
import { selectPrompt } from '../../store/slices/quickActionSlice';
import type { LocalizedPrompt, LocalizedQuickAction } from '../../types/quickAction';
import XMarkIcon from '../icons/XMarkIcon';

interface PromptPanelProps {
  action: LocalizedQuickAction;
  onPromptSelect: (prompt: string, promptId: string) => void;
  onClose?: () => void;
}

interface PromptColorTheme {
  icon: React.ComponentType<{ className?: string }>;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  cardHoverBorder: string;
  cardHoverShadow: string;
  accentText: string;
  selectedBg: string;
  selectedBorder: string;
}

const FALLBACK_THEMES: PromptColorTheme[] = [
  {
    icon: PresentationChartBarIcon,
    badgeBg: 'bg-orange-500/12 dark:bg-orange-500/20',
    badgeBorder: 'border-orange-500/30',
    badgeText: 'text-orange-600 dark:text-orange-400',
    cardHoverBorder: 'hover:border-orange-500/40',
    cardHoverShadow: 'hover:shadow-[0_4px_16px_rgba(234,88,12,0.12)]',
    accentText: 'group-hover:text-orange-600 dark:group-hover:text-orange-400',
    selectedBg: 'bg-orange-500/10 dark:bg-orange-500/16',
    selectedBorder: 'border-orange-500/60 ring-2 ring-orange-500/20',
  },
  {
    icon: ChartBarSquareIcon,
    badgeBg: 'bg-sky-500/12 dark:bg-sky-500/20',
    badgeBorder: 'border-sky-500/30',
    badgeText: 'text-sky-600 dark:text-sky-400',
    cardHoverBorder: 'hover:border-sky-500/40',
    cardHoverShadow: 'hover:shadow-[0_4px_16px_rgba(14,165,233,0.12)]',
    accentText: 'group-hover:text-sky-600 dark:group-hover:text-sky-400',
    selectedBg: 'bg-sky-500/10 dark:bg-sky-500/16',
    selectedBorder: 'border-sky-500/60 ring-2 ring-sky-500/20',
  },
  {
    icon: AcademicCapIcon,
    badgeBg: 'bg-emerald-500/12 dark:bg-emerald-500/20',
    badgeBorder: 'border-emerald-500/30',
    badgeText: 'text-emerald-600 dark:text-emerald-400',
    cardHoverBorder: 'hover:border-emerald-500/40',
    cardHoverShadow: 'hover:shadow-[0_4px_16px_rgba(16,185,129,0.12)]',
    accentText: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
    selectedBg: 'bg-emerald-500/10 dark:bg-emerald-500/16',
    selectedBorder: 'border-emerald-500/60 ring-2 ring-emerald-500/20',
  },
  {
    icon: SparklesIcon,
    badgeBg: 'bg-indigo-500/12 dark:bg-indigo-500/20',
    badgeBorder: 'border-indigo-500/30',
    badgeText: 'text-indigo-600 dark:text-indigo-400',
    cardHoverBorder: 'hover:border-indigo-500/40',
    cardHoverShadow: 'hover:shadow-[0_4px_16px_rgba(99,102,241,0.12)]',
    accentText: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
    selectedBg: 'bg-indigo-500/10 dark:bg-indigo-500/16',
    selectedBorder: 'border-indigo-500/60 ring-2 ring-indigo-500/20',
  },
];

function getPromptTheme(_skill: string, promptId: string, label: string, index: number): PromptColorTheme {
  const normalizedId = promptId.toLowerCase();
  const normalizedLabel = label.toLowerCase();

  if (normalizedId.includes('report') || normalizedLabel.includes('汇报') || normalizedLabel.includes('总结')) {
    return FALLBACK_THEMES[0];
  }
  if (normalizedId.includes('research') || normalizedLabel.includes('调研') || normalizedLabel.includes('分析')) {
    return FALLBACK_THEMES[1];
  }
  if (normalizedId.includes('training') || normalizedLabel.includes('培训') || normalizedLabel.includes('课件') || normalizedLabel.includes('入职')) {
    return FALLBACK_THEMES[2];
  }
  if (normalizedId.includes('ai') || normalizedLabel.includes('智能') || normalizedLabel.includes('科普')) {
    return FALLBACK_THEMES[3];
  }
  if (normalizedLabel.includes('统计') || normalizedLabel.includes('汇总')) {
    return {
      ...FALLBACK_THEMES[2],
      icon: TableCellsIcon,
    };
  }
  if (normalizedLabel.includes('图片') || normalizedLabel.includes('截图') || normalizedLabel.includes('转表格')) {
    return {
      ...FALLBACK_THEMES[1],
      icon: PhotoIcon,
    };
  }
  if (normalizedLabel.includes('合并') || normalizedLabel.includes('多表')) {
    return {
      ...FALLBACK_THEMES[0],
      icon: Square3Stack3DIcon,
    };
  }
  if (normalizedLabel.includes('会议') || normalizedLabel.includes('纪要')) {
    return {
      ...FALLBACK_THEMES[1],
      icon: ClipboardDocumentCheckIcon,
    };
  }
  if (normalizedLabel.includes('报告') || normalizedLabel.includes('公文') || normalizedLabel.includes('方案')) {
    return {
      ...FALLBACK_THEMES[0],
      icon: DocumentTextIcon,
    };
  }

  return FALLBACK_THEMES[index % FALLBACK_THEMES.length];
}

const PromptPanel: React.FC<PromptPanelProps> = ({ action, onPromptSelect, onClose }) => {
  const dispatch = useDispatch();
  const selectedPromptId = useSelector(
    (state: RootState) => state.quickAction.selectedPromptId
  );

  const handlePromptClick = (prompt: LocalizedPrompt) => {
    dispatch(selectPrompt(prompt.id));
    onPromptSelect(prompt.prompt, prompt.id);
  };

  if (!action.prompts || action.prompts.length === 0) {
    return null;
  }

  return (
    <div data-skin-prompt-panel="true" className="w-full animate-fade-in-up motion-reduce:animate-none">
      {onClose && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label={i18nService.t('coworkQuickActionCollapse')}
            title={i18nService.t('coworkQuickActionCollapse')}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-raised hover:text-foreground"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {action.prompts.map((prompt, index) => {
          const isPromptSelected = selectedPromptId === prompt.id;
          const theme = getPromptTheme(action.skillMapping, prompt.id, prompt.label, index);
          const Icon = theme.icon;

          return (
            <button
              key={prompt.id}
              type="button"
              onClick={() => handlePromptClick(prompt)}
              className={`group relative flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 motion-reduce:transition-none ${
                isPromptSelected
                  ? `${theme.selectedBg} ${theme.selectedBorder}`
                  : `border-border-subtle bg-surface ${theme.cardHoverBorder} ${theme.cardHoverShadow} hover:-translate-y-px`
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${theme.badgeBg} ${theme.badgeText}`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </div>

              <div className="min-w-0 flex-1">
                <span
                  className={`block truncate text-[13px] font-medium ${
                    isPromptSelected ? theme.badgeText : 'text-foreground'
                  }`}
                >
                  {prompt.label}
                </span>
                {prompt.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-muted">
                    {prompt.description}
                  </p>
                )}
              </div>

              <ArrowRightIcon
                className={`h-3.5 w-3.5 shrink-0 transition-all duration-200 ${theme.badgeText} ${
                  isPromptSelected
                    ? 'opacity-100'
                    : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PromptPanel;
