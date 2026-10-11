import { describe, expect, test, vi } from 'vitest';

import { WorkspaceProjectStore } from './workspaceProjects';

const setup = (initial: unknown = null) => {
  let saved = initial;
  const storage = { get: vi.fn(async () => saved), set: vi.fn(async (_key: string, value: unknown) => { saved = structuredClone(value); }) };
  return { storage, store: new WorkspaceProjectStore(storage) };
};

describe('workspace projects', () => {
  test('restores projects and conversation membership after reopening, with no project selected', async () => {
    const { store, storage } = setup();
    const project = await store.create('Research', '/work/research');
    await store.assignSession('conversation-1', project.id);
    await store.assignSession('conversation-2', null);
    const reopened = new WorkspaceProjectStore(storage);
    await reopened.initialize();
    expect(reopened.getSnapshot()).toMatchObject({
      ready: true, selectedProjectId: null,
      projects: [{ name: 'Research', directory: '/work/research' }],
      sessionProjects: { 'conversation-1': project.id, 'conversation-2': null },
    });
  });
  test('allows a project without a folder and keeps no-project conversations separate', async () => {
    const { store } = setup();
    const project = await store.create('Writing');
    expect(project.directory).toBe('');
    await store.assignSession('project-chat', project.id);
    store.select(null);
    await store.assignSession('independent-chat', null);
    expect(store.getSnapshot().sessionProjects).toEqual({ 'project-chat': project.id, 'independent-chat': null });
  });
  test('serializes concurrent changes without dropping projects or membership', async () => {
    const { store, storage } = setup();
    const [first, second] = await Promise.all([store.create('First'), store.create('Second')]);
    await Promise.all([store.assignSession('one', first.id), store.assignSession('two', second.id)]);
    const reopened = new WorkspaceProjectStore(storage);
    await reopened.initialize();
    expect(reopened.getSnapshot().projects).toHaveLength(2);
    expect(reopened.getSnapshot().sessionProjects).toEqual({ one: first.id, two: second.id });
  });
  test('a failed save does not show a project as persisted and can be retried', async () => {
    const { store, storage } = setup();
    storage.set.mockRejectedValueOnce(new Error('disk full'));
    await expect(store.create('Not saved')).rejects.toThrow('disk full');
    expect(store.getSnapshot().projects).toEqual([]);
    await store.create('Saved');
    expect(store.getSnapshot().projects.map(p => p.name)).toEqual(['Saved']);
  });
  test('rejects empty names and ignores stale project references', async () => {
    const { store } = setup({ projects: [], sessionProjects: { old: 'removed', standalone: null } });
    await store.initialize();
    await expect(store.create('   ')).rejects.toThrow();
    store.select('removed');
    expect(store.getSnapshot().selectedProjectId).toBeNull();
    expect(store.getSnapshot().sessionProjects).toEqual({ standalone: null });
  });
  test('a delayed save does not undo a project selection change', async () => {
    const { store, storage } = setup();
    const project = await store.create('Project');
    let finish!: () => void;
    storage.set.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const saved = store.assignSession('chat', project.id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    store.select(null);
    finish();
    await saved;
    expect(store.getSnapshot().selectedProjectId).toBeNull();
    expect(store.getSnapshot().sessionProjects.chat).toBe(project.id);
  });
  test('editing retains membership; removing only the group preserves conversations', async () => {
    const { store, storage } = setup();
    const first = await store.create('First', '/first');
    const second = await store.create('Second', '/second');
    await store.assignSession('one', first.id);
    await store.assignSession('two', second.id);
    await store.update(first.id, 'Renamed', '/new folder');
    expect(store.getSnapshot().sessionProjects.one).toBe(first.id);
    expect(store.getSnapshot().projects[0]).toMatchObject({ name: 'Renamed', directory: '/new folder' });
    store.select(first.id);
    await store.remove(first.id);
    expect(store.getSnapshot().selectedProjectId).toBeNull();
    const reopened = new WorkspaceProjectStore(storage);
    await reopened.initialize();
    expect(reopened.getSnapshot().sessionProjects).toEqual({ one: null, two: second.id });
    expect(reopened.getSnapshot().projects.map(p => p.id)).toEqual([second.id]);
  });
  test('failed project removal leaves project and membership intact', async () => {
    const { store, storage } = setup();
    const project = await store.create('Keep');
    await store.assignSession('chat', project.id);
    storage.set.mockRejectedValueOnce(new Error('disk full'));
    await expect(store.remove(project.id)).rejects.toThrow();
    expect(store.getSnapshot().projects).toHaveLength(1);
    expect(store.getSnapshot().sessionProjects.chat).toBe(project.id);
  });

});
