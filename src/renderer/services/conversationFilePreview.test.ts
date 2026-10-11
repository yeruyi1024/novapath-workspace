import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import artifactReducer from '../store/slices/artifactSlice';
import { previewConversationFile } from './conversationFilePreview';

const statFile = vi.fn();
const readFileAsDataUrl = vi.fn();
const createContext = (sessionId = 'conversation-1', cwd = '/work/project') => {
  let state = artifactReducer(undefined, { type: '@@init' });
  const dispatch = vi.fn(action => { state = artifactReducer(state, action); });
  return { sessionId, cwd, dispatch, isCurrent: () => true, getState: () => state };
};

beforeEach(() => {
  statFile.mockReset().mockResolvedValue({ success: true, isFile: true, mtimeMs: 42 });
  readFileAsDataUrl.mockReset().mockResolvedValue({ success: true, dataUrl: 'data:text/plain;base64,IyBSZXBvcnQ=' });
  vi.stubGlobal('window', { electron: { platform: 'darwin', dialog: { statFile, readFileAsDataUrl } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('conversation file references', () => {
  test('opens a referenced PPTX in the current conversation panel using its working directory', async () => {
    const context = createContext();
    await expect(previewConversationFile('./slides/../方案 #1 100%20.PPTX', context)).resolves.toBe(true);
    expect(statFile).toHaveBeenCalledWith('/work/project/方案 #1 100%20.PPTX');
    const state = context.getState();
    const [artifact] = state.artifactsBySession[context.sessionId];
    expect(artifact).toMatchObject({ sessionId: context.sessionId, filePath: '/work/project/方案 #1 100%20.PPTX', type: 'document' });
    expect(state.panelOpenBySession[context.sessionId]).toBe(true);
    expect(state.selectedArtifactId).toBe(artifact.id);
    expect(state.previewTabsBySession[context.sessionId]).toHaveLength(1);
  });

  test('repeated clicks reuse the file tab and separate references retain distinct names', async () => {
    const context = createContext();
    await previewConversationFile('report #1.pptx', context);
    await previewConversationFile('report #1.pptx', context);
    await previewConversationFile('report #2.pptx', context);
    const state = context.getState();
    expect(state.artifactsBySession[context.sessionId]).toHaveLength(2);
    expect(state.previewTabsBySession[context.sessionId]).toHaveLength(2);
    expect(state.artifactsBySession[context.sessionId].find(item => item.id === state.selectedArtifactId)?.filePath)
      .toBe('/work/project/report #2.pptx');
  });

  test('loads referenced text rather than launching the system application', async () => {
    const context = createContext();
    await previewConversationFile('report.md', context);
    expect(readFileAsDataUrl).toHaveBeenCalledWith('/work/project/report.md');
    expect(context.getState().artifactsBySession[context.sessionId][0].content).toBe('# Report');
  });

  test('the same file keeps separate preview identities in different conversations', async () => {
    const context = createContext();
    await previewConversationFile('deck.pptx', context);
    await previewConversationFile('deck.pptx', { ...context, sessionId: 'conversation-2' });
    const state = context.getState();
    const first = state.artifactsBySession[context.sessionId][0];
    const second = state.artifactsBySession['conversation-2'][0];
    expect(first.id).not.toBe(second.id);
    expect(state.previewTabsBySession[context.sessionId][0].artifactId).toBe(first.id);
    expect(state.previewTabsBySession['conversation-2'][0].artifactId).toBe(second.id);
    expect(state.selectedArtifactId).toBe(second.id);
  });

  test.each([
    ['win32', '.\\deck.pptx', 'D:\\company\\project', 'D:/company/project/deck.pptx'],
    ['win32', '\\\\server\\share\\演示.pptx', 'D:\\project', '//server/share/演示.pptx'],
    ['linux', '../演示.pptx', '/home/user/project', '/home/user/演示.pptx'],
  ])('supports references on %s: %s', async (platform, filePath, cwd, expected) => {
    vi.stubGlobal('window', { electron: { platform, dialog: { statFile } } });
    await previewConversationFile(filePath, createContext('platform-conversation', cwd));
    expect(statFile).toHaveBeenCalledWith(expected);
  });

  test('decodes a file URL once and never uses another project directory', async () => {
    const context = createContext('unassigned-conversation', '');
    await previewConversationFile('file:///tmp/report%2520%23.pptx', context);
    expect(statFile).toHaveBeenCalledWith('/tmp/report%20#.pptx');
    await expect(previewConversationFile('relative.pptx', context)).rejects.toThrow();
  });

  test('leaves unsupported file formats to the system application', async () => {
    const context = createContext();
    await expect(previewConversationFile('/work/legacy.ppt', context)).resolves.toBe(false);
    expect(statFile).not.toHaveBeenCalled();
    expect(context.dispatch).not.toHaveBeenCalled();
  });

  test('a missing file does not create an empty preview tab', async () => {
    statFile.mockResolvedValue({ success: false });
    const context = createContext();
    await expect(previewConversationFile('missing.pptx', context)).rejects.toThrow();
    expect(context.dispatch).not.toHaveBeenCalled();
  });

  test('a read finishing after the conversation changes does not reopen the previous panel', async () => {
    let finish: (value: unknown) => void = () => {};
    statFile.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const context = createContext();
    let current = true;
    context.isCurrent = () => current;
    const pending = previewConversationFile('deck.pptx', context);
    current = false;
    finish({ success: true, isFile: true });
    await expect(pending).resolves.toBe(true);
    expect(context.dispatch).not.toHaveBeenCalled();
  });
});
