import { useState } from 'react';

import { i18nService } from '../../services/i18n';
import { workspaceProjects } from '../../services/workspaceProjects';
import Modal from '../common/Modal';
import { useWorkspaceProjects } from './useWorkspaceProjects';

export function ProjectMoveDialog({ sessionId, title, onClose }: { sessionId: string; title: string; onClose: () => void }) {
  const state = useWorkspaceProjects();
  const [selected, setSelected] = useState(state.sessionProjects[sessionId] ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <Modal onClose={() => { if (!saving) onClose(); }} className="w-[400px] rounded-2xl border border-border bg-background p-6">
    <h2 className="text-base font-medium">{i18nService.t('projectMoveChat')}</h2>
    <p className="my-3 truncate text-sm text-secondary">{title}</p>
    <select aria-label={i18nService.t('projectSelect')} disabled={saving} value={selected} onChange={event => setSelected(event.target.value)} className="w-full rounded-lg border border-border bg-background p-2 text-sm">
      <option value="">{i18nService.t('projectNone')}</option>
      {state.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
    <p className="my-3 text-xs text-muted">{i18nService.t('projectMoveHint')}</p>
    {error && <p role="alert" className="text-sm text-error">{error}</p>}
    <div className="mt-5 flex justify-end gap-2"><button disabled={saving} className="rounded-lg px-3 py-2" onClick={onClose}>{i18nService.t('cancel')}</button>
      <button disabled={saving} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground" onClick={async () => {
        setSaving(true);
        try { await workspaceProjects.assignSession(sessionId, selected || null); onClose(); }
        catch { setError(i18nService.t('projectSaveError')); setSaving(false); }
      }}>{i18nService.t('save')}</button></div>
  </Modal>;
}
