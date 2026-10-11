import { FolderIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';

import { i18nService } from '../../services/i18n';
import { validateProjectDirectory } from '../../services/workspaceFiles';
import { type WorkspaceProject, workspaceProjects } from '../../services/workspaceProjects';
import Modal from '../common/Modal';
import { useWorkspaceProjects } from './useWorkspaceProjects';

export const ProjectCreateDialog: React.FC<{ onClose: () => void; onCreated?: () => void; project?: WorkspaceProject }> = ({ onClose, onCreated, project }) => {
  const [name, setName] = useState(project?.name ?? '');
  const [directory, setDirectory] = useState(project?.directory ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <Modal onClose={onClose} onEscape={onClose} className="w-[420px] max-w-[calc(100vw-32px)] rounded-2xl border border-border bg-background p-6 shadow-xl">
    <h2 className="mb-5 text-lg font-medium">{i18nService.t(project ? 'projectEdit' : 'projectCreate')}</h2>
    <form className="space-y-5 p-1" onSubmit={async event => {
      event.preventDefault();
      if (saving || !name.trim()) return;
      setSaving(true);
      try {
        let validDirectory: string;
        try { validDirectory = await validateProjectDirectory(directory); }
        catch { setError(i18nService.t('projectPathInvalid')); setSaving(false); return; }
        if (project) await workspaceProjects.update(project.id, name, validDirectory);
        else await workspaceProjects.create(name, validDirectory);
        onCreated?.(); onClose();
      }
      catch { setError(i18nService.t('projectSaveError')); setSaving(false); }
    }}>
      <label className="block text-sm text-secondary">{i18nService.t('projectName')}
        <input autoFocus disabled={saving} required maxLength={80} value={name} onChange={event => setName(event.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary" />
      </label>
      <div>
        <button type="button" disabled={saving} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm" onClick={async () => {
          const result = await window.electron.dialog.selectDirectory();
          if (result.success && result.path) setDirectory(result.path);
        }}><FolderIcon className="h-4 w-4" />{i18nService.t('projectFolderOptional')}</button>
        <input aria-label={i18nService.t('projectPath')} value={directory} disabled={saving} onChange={event => setDirectory(event.target.value)}
          placeholder={i18nService.t('projectPath')} className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs" />
        <p className="mt-2 text-xs leading-5 text-muted">{i18nService.t('projectFolderHint')}</p>
      </div>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" disabled={saving} onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-surface-raised">{i18nService.t('cancel')}</button>
        <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40">{i18nService.t(project ? 'save' : 'projectCreate')}</button>
      </div>
    </form>
  </Modal>;
};

export const ProjectSelector: React.FC = () => {
  const { projects, selectedProjectId, ready } = useWorkspaceProjects();
  return <div className="flex min-w-0 items-center gap-1 text-secondary">
    <FolderIcon className="h-3.5 w-3.5 shrink-0" />
    <select aria-label={i18nService.t('projectSelect')} value={selectedProjectId ?? ''} disabled={!ready}
      onChange={event => workspaceProjects.select(event.target.value || null)}
      className="max-w-[140px] min-w-0 cursor-pointer rounded-md bg-transparent py-1.5 pl-1 pr-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary">
      <option value="">{i18nService.t('projectNone')}</option>
      {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>

  </div>;
};
