export interface WorkspaceProject {
  id: string;
  name: string;
  directory: string;
}
export interface WorkspaceProjectState {
  projects: WorkspaceProject[];
  sessionProjects: Record<string, string | null>;
  selectedProjectId: string | null;
  ready: boolean;
}
interface ProjectStorage {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}
const STORAGE_KEY = 'product.workspace-projects.v1';

/** Project membership is independent of an agent and of its execution directory. */
export class WorkspaceProjectStore {
  private state: WorkspaceProjectState = { projects: [], sessionProjects: {}, selectedProjectId: null, ready: false };
  private listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private storage: ProjectStorage) {}
  getSnapshot = (): WorkspaceProjectState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(next: WorkspaceProjectState): void {
    this.state = next;
    this.listeners.forEach(listener => listener());
  }
  initialize = (): Promise<void> => {
    if (this.state.ready) return Promise.resolve();
    if (!this.loading) this.loading = this.storage.get(STORAGE_KEY).then(raw => {
      const data = raw as Partial<WorkspaceProjectState> | null;
      const projects = Array.isArray(data?.projects) ? data.projects.filter(p => p
        && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.directory === 'string') : [];
      const ids = new Set(projects.map(p => p.id));
      const sessionProjects = Object.fromEntries(Object.entries(data?.sessionProjects ?? {})
        .filter(([, id]) => id === null || (typeof id === 'string' && ids.has(id))));
      this.publish({ ...this.state, projects, sessionProjects, ready: true });
    }).finally(() => { this.loading = null; });
    return this.loading;
  };
  select = (id: string | null): void => {
    this.publish({ ...this.state, selectedProjectId: this.state.projects.some(p => p.id === id) ? id : null });
  };
  private mutate(operation: (state: WorkspaceProjectState) => WorkspaceProjectState): Promise<void> {
    const write = this.writes.catch(() => undefined).then(async () => {
      await this.initialize();
      const next = operation(this.state);
      await this.storage.set(STORAGE_KEY, { projects: next.projects, sessionProjects: next.sessionProjects });
      this.publish({ ...next, selectedProjectId: next.projects.some(p => p.id === this.state.selectedProjectId) ? this.state.selectedProjectId : null });
    });
    this.writes = write;
    return write;
  }
  async create(name: string, directory = ''): Promise<WorkspaceProject> {
    if (!name.trim()) throw new Error('Project name is required');
    const project = { id: crypto.randomUUID(), name: name.trim(), directory: directory.trim() };
    await this.mutate(state => ({ ...state, projects: [...state.projects, project] }));
    this.select(project.id);
    return project;
  }
  async update(id: string, name: string, directory: string): Promise<void> {
    if (!name.trim()) throw new Error('Project name is required');
    await this.mutate(state => {
      if (!state.projects.some(p => p.id === id)) throw new Error('Project no longer exists');
      return { ...state, projects: state.projects.map(p => p.id === id ? { ...p, name: name.trim(), directory } : p) };
    });
  }
  remove(id: string): Promise<void> {
    return this.mutate(state => ({ ...state, projects: state.projects.filter(p => p.id !== id),
      sessionProjects: Object.fromEntries(Object.entries(state.sessionProjects).map(([session, project]) => [session, project === id ? null : project])) }));
  }
  assignSession(sessionId: string, projectId: string | null): Promise<void> {
    return this.mutate(state => ({ ...state, sessionProjects: { ...state.sessionProjects,
      [sessionId]: state.projects.some(p => p.id === projectId) ? projectId : null } }));
  }
}
export const workspaceProjects = new WorkspaceProjectStore({
  get: key => window.electron.store.get(key),
  set: (key, value) => window.electron.store.set(key, value),
});
