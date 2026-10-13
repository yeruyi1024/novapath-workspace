import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import { setActiveSkillIds } from '../../store/slices/skillSlice';
import PromptPanel from './PromptPanel';
import QuickActionBar from './QuickActionBar';

const OFFICE_SKILLS = ['docx', 'xlsx', 'pptx', 'pdf'];

interface OfficeQuickActionsProps {
  disabled?: boolean;
  onPromptSelect: (prompt: string) => void;
  onManageSkills: () => void;
}

const OfficeQuickActions: React.FC<OfficeQuickActionsProps> = ({ disabled, onPromptSelect, onManageSkills }) => {
  const dispatch = useDispatch();
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const actions = useSelector((state: RootState) => state.quickAction.actions);
  const skills = useSelector((state: RootState) => state.skill.skills);
  const activeSkillIds = useSelector((state: RootState) => state.skill.activeSkillIds);
  const officeActions = OFFICE_SKILLS.flatMap(id => actions.filter(action => action.skillMapping === id));
  const openAction = officeActions.find(action => action.id === openActionId
    && activeSkillIds.includes(action.skillMapping)
    && skills.some(skill => skill.id === action.skillMapping && skill.enabled));

  return (
    <div className="mt-5 w-full space-y-4">
      <QuickActionBar
        actions={officeActions}
        selectedActionId={officeActions.find(action => activeSkillIds.includes(action.skillMapping)
          && skills.some(skill => skill.id === action.skillMapping && skill.enabled))?.id}
        disabled={disabled}
        onActionSelect={(id) => {
          const action = officeActions.find(item => item.id === id);
          if (!action) return;
          if (!skills.some(skill => skill.id === action.skillMapping && skill.enabled)) {
            onManageSkills();
            return;
          }
          // Replace only the office category; preserve other user-selected capabilities.
          dispatch(setActiveSkillIds([
            ...activeSkillIds.filter(skillId => !OFFICE_SKILLS.includes(skillId)),
            action.skillMapping,
          ]));
          setOpenActionId(openActionId === id ? null : id);
        }}
      />
      {openAction && !disabled && (
        <div className="rounded-2xl border border-border-subtle bg-surface p-4">
          <PromptPanel
            action={openAction}
            onPromptSelect={(prompt) => { onPromptSelect(prompt); setOpenActionId(null); }}
            onClose={() => setOpenActionId(null)}
          />
          <p className="mt-3 text-xs leading-5 text-muted">{i18nService.t('officeQuickActionsDraftHint')}</p>
        </div>
      )}
    </div>
  );
};

export default OfficeQuickActions;
