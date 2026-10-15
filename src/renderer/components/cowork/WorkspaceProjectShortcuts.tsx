import { ArrowUpRightIcon, FolderIcon } from '@heroicons/react/24/outline';

import { i18nService } from '../../services/i18n';
import type { WorkspaceProject } from '../../services/workspaceProjects';

interface Props {
  projects: WorkspaceProject[];
  onSelect: (projectId: string) => void;
}

export default function WorkspaceProjectShortcuts({ projects, onSelect }: Props) {
  if (projects.length === 0) return null;

  return (
    <section className="workspace-project-shortcuts mt-8 w-full" aria-label={i18nService.t('workspaceProjectShortcuts')}>
      <h2 className="mb-2.5 px-1 text-xs font-medium text-secondary">{i18nService.t('workspaceProjectShortcuts')}</h2>
      <div className="workspace-project-shortcuts-grid">
        {projects.slice(0, 3).map(project => (
          <button key={project.id} type="button" onClick={() => onSelect(project.id)}
            title={project.directory ? `${project.name}\n${project.directory}` : project.name}
            className="workspace-project-shortcut group">
            <span className="flex w-full min-w-0 items-center gap-2 text-[13px] font-medium text-foreground">
              <FolderIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-secondary group-hover:text-primary" />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <ArrowUpRightIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" />
            </span>
            {project.directory && <span className="w-full truncate font-mono text-[11px] text-muted">{project.directory}</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
