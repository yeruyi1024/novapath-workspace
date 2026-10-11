import { BoltIcon, ChevronRightIcon, Cog6ToothIcon, FolderIcon, FolderPlusIcon, MagnifyingGlassIcon, PlusIcon, PuzzlePieceIcon, Squares2X2Icon } from '@heroicons/react/24/outline';
import { AgentId } from '@shared/agent';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { PRODUCT } from '../../shared/product';
import { agentService } from '../services/agent';
import { coworkService } from '../services/cowork';
import { i18nService } from '../services/i18n';
import { type WorkspaceProject, workspaceProjects } from '../services/workspaceProjects';
import { selectCoworkSessions, selectCurrentSessionId } from '../store/selectors/coworkSelectors';
import type { CoworkSessionSummary } from '../types/cowork';
import { openLocalPathWithToast } from '../utils/localFileActions';
import CardOverflowMenu from './common/CardOverflowMenu';
import Modal from './common/Modal';
import { CoworkUiEvent } from './cowork/constants';
import CoworkSearchModal from './cowork/CoworkSearchModal';
import CoworkSessionItem from './cowork/CoworkSessionItem';
import ComposeIcon from './icons/ComposeIcon';
import SidebarToggleIcon from './icons/SidebarToggleIcon';
import { ProjectCreateDialog } from './projects/ProjectControls';
import { ProjectMoveDialog } from './projects/ProjectMoveDialog';
import { useWorkspaceProjects } from './projects/useWorkspaceProjects';

interface SidebarProps {
  onShowSettings: () => void;
  activeView: 'cowork' | 'skills' | 'scheduledTasks' | 'kits' | 'mcp' | 'library';
  onShowSkills: () => void;
  onShowCowork: () => void;
  onShowScheduledTasks: () => void;
  onShowKits: () => void;
  onShowLibrary: () => void;
  onNewChat: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onWidthChange?: (width: number) => void;
  updateNotice?: React.ReactNode;
}

const Sidebar: React.FC<SidebarProps> = ({ onShowSettings, activeView, onShowSkills, onShowCowork,
  onShowScheduledTasks, onShowKits, onShowLibrary, onNewChat, isCollapsed, onToggleCollapse,
  onWidthChange, updateNotice }) => {
  const projectsState = useWorkspaceProjects();
  const currentSessionId = useSelector(selectCurrentSessionId);
  const liveSessions = useSelector(selectCoworkSessions);
  const sessionVersion = liveSessions.map(session => `${session.id}:${session.title}:${session.status}:${session.pinned}`).join('|');
  const [sessions, setSessions] = useState<CoworkSessionSummary[]>([]);
  const [limit, setLimit] = useState(100);
  const [hasMore, setHasMore] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [editing, setEditing] = useState<WorkspaceProject | null>(null);
  const [removing, setRemoving] = useState<WorkspaceProject | null>(null);
  const [moving, setMoving] = useState<CoworkSessionSummary | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(activeView !== 'cowork');
  const [pendingDelete, setPendingDelete] = useState<CoworkSessionSummary | null>(null);
  const [error, setError] = useState('');
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    const result = await coworkService.listSessionsForSearch(limit, 0);
    if (id !== request.current) return;
    if (result.success) { setSessions(result.sessions ?? []); setHasMore(result.hasMore ?? false); }
  }, [limit]);
  useEffect(() => { void refresh(); }, [refresh, sessionVersion]);
  useEffect(() => { onWidthChange?.(240); }, [onWidthChange]);
  useEffect(() => { if (activeView !== 'cowork') setToolsOpen(true); }, [activeView]);
  useEffect(() => {
    const open = () => setSearchOpen(true);
    window.addEventListener(CoworkUiEvent.ShortcutSearch, open);
    return () => window.removeEventListener(CoworkUiEvent.ShortcutSearch, open);
  }, []);
  const selectSession = async (session: CoworkSessionSummary) => {
    workspaceProjects.select(projectsState.sessionProjects[session.id] ?? null);
    agentService.switchAgent(session.agentId || AgentId.Main, { targetSessionId: session.id });
    onShowCowork();
    try { await coworkService.loadSession(session.id); }
    finally { coworkService.finishSessionNavigation(session.id); }
  };
  const startChat = (projectId: string | null) => {
    onNewChat();
    workspaceProjects.select(projectId);
  };
  const renderSession = (session: CoworkSessionSummary) => <CoworkSessionItem key={session.id}
    session={session} hasUnread={false} isActive={session.id === currentSessionId && activeView === 'cowork'}
    isBatchMode={false} isSelected={false} showBatchOption={false} compact
    onSelect={() => { void selectSession(session); }} onDelete={() => setPendingDelete(session)}
    onMoveToProject={() => setMoving(session)}
    onRename={title => { void coworkService.renameSession(session.id, title).then(refresh); }}
    onTogglePin={pinned => { void coworkService.setSessionPinned(session.id, pinned).then(refresh); }}
    onToggleSelection={() => undefined} onEnterBatchMode={() => undefined} />;
  const ungrouped = sessions.filter(session => !projectsState.sessionProjects[session.id]);
  const tools = [
    { label: 'skillsAndConnectors', action: onShowSkills, icon: PuzzlePieceIcon, active: activeView === 'skills' || activeView === 'mcp' },
    { label: 'kits', action: onShowKits, icon: Squares2X2Icon, active: activeView === 'kits' },
    { label: 'scheduledTasks', action: onShowScheduledTasks, icon: BoltIcon, active: activeView === 'scheduledTasks' },
    { label: 'librarySidebarTitle', action: onShowLibrary, icon: FolderIcon, active: activeView === 'library' },
  ];
  return <>
    <aside aria-label={i18nService.t('projectNavigation')} aria-hidden={isCollapsed}
      className="workspace-sidebar relative flex h-full shrink-0 flex-col overflow-hidden transition-[width] duration-200"
      style={{ width: isCollapsed ? 0 : 240, visibility: isCollapsed ? 'hidden' : 'visible' }}>
      {window.electron.platform !== 'win32' && <div className="draggable flex h-12 shrink-0 items-center justify-end px-4" style={{ minWidth: 240 }}>
        <button type="button" onClick={onToggleCollapse} aria-label={i18nService.t('collapse')}
          className="non-draggable rounded-md p-1.5 text-secondary hover:bg-surface-raised"><SidebarToggleIcon className="h-4 w-4" isCollapsed={false} /></button>
      </div>}
      <div className={`space-y-0.5 px-3 pb-5 ${window.electron.platform === 'win32' ? 'pt-3' : ''}`} style={{ minWidth: 240 }}>
        <button type="button" onClick={() => startChat(null)} className="workspace-new-chat flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-foreground hover:bg-surface-raised">
          <ComposeIcon className="h-4 w-4" />{i18nService.t('newChat')}
        </button>
        <button type="button" onClick={() => setSearchOpen(true)} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-secondary hover:bg-surface-raised">
          <MagnifyingGlassIcon className="h-4 w-4" />{i18nService.t('workspaceSearch')}
        </button>

      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3" style={{ minWidth: 240 }}>
        <div className="mb-1 flex h-8 items-center justify-between px-2.5 text-[11px] font-medium text-muted">
          <span>{i18nService.t('projectTitle')}</span>
          <button type="button" onClick={() => setCreating(true)} aria-label={i18nService.t('projectCreate')} className="rounded p-1 hover:bg-surface-raised"><PlusIcon className="h-4 w-4" /></button>
        </div>
        {projectsState.projects.map(project => {
          const children = sessions.filter(session => projectsState.sessionProjects[session.id] === project.id);
          const collapsed = collapsedProjects.has(project.id);
          return <div key={project.id} className="mb-1">
            <div data-selected={projectsState.selectedProjectId === project.id || undefined} className={`workspace-project-row group flex items-center rounded-lg hover:bg-surface-raised ${projectsState.selectedProjectId === project.id ? 'bg-surface-raised' : ''}`}>
              <button type="button" aria-label={`${collapsed ? i18nService.t('expand') : i18nService.t('collapse')} ${project.name}`} aria-expanded={!collapsed}
                onClick={() => setCollapsedProjects(previous => { const next = new Set(previous); if (collapsed) next.delete(project.id); else next.add(project.id); return next; })}
                className="p-1.5 text-muted"><ChevronRightIcon className={`h-3 w-3 transition-transform ${collapsed ? '' : 'rotate-90'}`} /></button>
              <button type="button" onClick={() => startChat(project.id)} title={project.directory || project.name}
                className="flex h-9 min-w-0 flex-1 items-center gap-2 text-left text-[13px]"><FolderIcon className="h-4 w-4 shrink-0 text-secondary" /><span className="truncate">{project.name}</span></button>
              <button type="button" onClick={() => startChat(project.id)} aria-label={`${i18nService.t('newChat')} · ${project.name}`}
                className="mr-1 rounded p-1.5 text-secondary opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100"><PlusIcon className="h-3.5 w-3.5" /></button>
              <CardOverflowMenu className="opacity-0 group-hover:opacity-100 focus-within:opacity-100" items={[
                { key: 'edit', label: i18nService.t('projectEdit'), onSelect: () => setEditing(project) },
                { key: 'folder', label: i18nService.t('projectOpenFolder'), disabled: !project.directory, onSelect: () => { void openLocalPathWithToast(project.directory); } },
                { key: 'remove', label: i18nService.t('projectRemove'), destructive: true, onSelect: () => { setError(''); setRemoving(project); } },
              ]} />
            </div>
            {!collapsed && children.length > 0 && <div className="workspace-project-chats ml-4 space-y-0.5 pl-1">
              {children.map(renderSession)}

            </div>}
          </div>;
        })}
        {projectsState.projects.length === 0 && <button type="button" onClick={() => setCreating(true)} className="mb-3 flex h-9 w-full items-center gap-2 rounded-lg px-2 text-sm text-secondary hover:bg-surface-raised"><FolderPlusIcon className="h-4 w-4" />{i18nService.t('projectCreate')}</button>}
        <div className="mb-1 mt-6 px-2.5 text-[11px] font-medium text-muted">{i18nService.t('projectChats')}</div>
        {ungrouped.map(renderSession)}
        {ungrouped.length === 0 && <p className="px-2 py-2 text-xs text-muted">{i18nService.t('projectNoChats')}</p>}
        {hasMore && <button type="button" className="px-2 py-3 text-xs text-secondary" onClick={() => setLimit(value => value + 100)}>{i18nService.t('libraryLoadMore')}</button>}
      </div>
      <div className="space-y-1 px-3 pb-3 pt-3" style={{ minWidth: 240 }}>
        {updateNotice}

        <div className="workspace-navigation">
          <button type="button" aria-expanded={toolsOpen} aria-controls="workspace-tools" onClick={() => setToolsOpen(value => !value)}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-secondary hover:bg-surface-raised">
            <Squares2X2Icon className="h-4 w-4" /><span className="flex-1 text-left">{i18nService.t('workspaceTools')}</span>
            <ChevronRightIcon className={`h-3 w-3 transition-transform ${toolsOpen ? 'rotate-90' : ''}`} />
          </button>
          {toolsOpen && <div id="workspace-tools" className="mb-2 mt-1 space-y-0.5">{tools.map(({ label, action, icon: Icon, active }) => <button key={label} type="button" onClick={action}
            aria-current={active ? 'page' : undefined} className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs hover:bg-surface-raised ${active ? 'bg-surface-raised text-foreground' : 'text-secondary'}`}><Icon className="h-3.5 w-3.5" />{i18nService.t(label)}</button>)}</div>}
        </div>
        <button type="button" onClick={onShowSettings} className="flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-secondary hover:bg-surface-raised">
          <img src="logo.svg" alt="" className="h-6 w-6 shrink-0" /><span className="flex-1 text-left font-medium text-foreground">{PRODUCT.name}</span><Cog6ToothIcon className="h-4 w-4" /><span className="sr-only">{i18nService.t('settings')}</span>
        </button>
      </div>
    </aside>
    {editing && <ProjectCreateDialog project={editing} onClose={() => setEditing(null)} />}
    {moving && <ProjectMoveDialog sessionId={moving.id} title={moving.title} onClose={() => setMoving(null)} />}
    {removing && <Modal onClose={() => { if (!removingBusy) setRemoving(null); }} className="w-[400px] rounded-2xl border border-border bg-background p-6">
      <h2 className="text-base font-medium">{i18nService.t('projectRemove')} · {removing.name}</h2>
      <p className="my-4 text-sm text-secondary">{i18nService.t('projectRemoveHint')}</p>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2"><button disabled={removingBusy} className="rounded-lg px-3 py-2" onClick={() => setRemoving(null)}>{i18nService.t('cancel')}</button>
        <button disabled={removingBusy} className="rounded-lg bg-error px-3 py-2 text-white" onClick={async () => {
          setRemovingBusy(true);
          try { await workspaceProjects.remove(removing.id); setRemoving(null); }
          catch { setError(i18nService.t('projectSaveError')); }
          finally { setRemovingBusy(false); }
        }}>{i18nService.t('projectRemove')}</button></div>
    </Modal>}
    {creating && <ProjectCreateDialog onClose={() => setCreating(false)} onCreated={() => startChat(workspaceProjects.getSnapshot().selectedProjectId)} />}
    <CoworkSearchModal isOpen={searchOpen} onClose={() => setSearchOpen(false)} sessions={sessions} currentSessionId={currentSessionId} onSelectSession={selectSession} />
    {pendingDelete && <Modal onClose={() => setPendingDelete(null)} onEscape={() => setPendingDelete(null)} className="w-[380px] rounded-2xl border border-border bg-background p-6">
      <h2 className="text-base font-medium">{i18nService.t('projectDeleteChat')}</h2><p className="my-4 text-sm text-secondary">{pendingDelete.title}</p>
      {error && <p role="alert" className="text-error">{error}</p>}
      <div className="flex justify-end gap-2"><button className="rounded-lg px-3 py-2" onClick={() => setPendingDelete(null)}>{i18nService.t('cancel')}</button>
        <button className="rounded-lg bg-error px-3 py-2 text-white" onClick={async () => {
          if (await coworkService.deleteSession(pendingDelete.id)) { setPendingDelete(null); await refresh(); }
          else setError(i18nService.t('projectSaveError'));
        }}>{i18nService.t('deleteSession')}</button></div>
    </Modal>}
  </>;
};
export default Sidebar;
