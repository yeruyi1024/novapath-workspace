import { afterEach, describe, expect, test, vi } from 'vitest';

import { loadLocalFileArtifact, resolveWorkspacePath, validateProjectDirectory } from './workspaceFiles';

afterEach(() => vi.unstubAllGlobals());
describe('workspace local files', () => {
  test('keeps literal punctuation, Chinese and spaces in native paths', () => {
    expect(resolveWorkspacePath('/work/方案 #1 100%20.pptx')).toBe('/work/方案 #1 100%20.pptx');
    expect(resolveWorkspacePath('slides/#1.pptx', '/work/中文 项目')).toBe('/work/中文 项目/slides/#1.pptx');
  });
  test('decodes file URLs once, including Windows drives and UNC shares', () => {
    expect(resolveWorkspacePath('file:///work/%E6%96%B9%E6%A1%88%20%231%2520.pptx')).toBe('/work/方案 #1%20.pptx');
    expect(resolveWorkspacePath('file:///C:/My%20Files/deck.pptx')).toBe('C:/My Files/deck.pptx');
    expect(resolveWorkspacePath('file://server/share/deck.pptx')).toBe('//server/share/deck.pptx');
    expect(resolveWorkspacePath('\\\\server\\share\\deck.pptx', '/project')).toBe('//server/share/deck.pptx');
  });
  test('rejects ambiguous relative paths, remote URLs and unexpanded home paths', () => {
    for (const input of ['', 'deck.pptx', '~/deck.pptx', 'https://example.org/deck.pptx', 'C:deck.pptx']) {
      expect(() => resolveWorkspacePath(input)).toThrow();
    }
  });
  test.each([
    ['C:\\Users\\测试\\deck.pptx', '', 'C:/Users/测试/deck.pptx'],
    ['.\\slides\\..\\方案 #1.pptx', 'D:\\Work Space', 'D:/Work Space/方案 #1.pptx'],
    ['..\\deck.pptx', '\\\\server\\share\\project', '//server/share/deck.pptx'],
    ['..\\..\\deck.pptx', '\\\\server\\share', '//server/share/deck.pptx'],
    ['file:///C:/Work%20Space/%E6%96%B9%E6%A1%88.pptx', '', 'C:/Work Space/方案.pptx'],
    ['file://server/share/My%20Deck.pptx', '', '//server/share/My Deck.pptx'],
  ])('resolves Windows paths without relying on the host OS: %s', (input, root, expected) => {
    expect(resolveWorkspacePath(input, root, 'win32')).toBe(expected);
  });
  test.each(['darwin', 'linux'] as const)('preserves POSIX filename semantics on %s', platform => {
    expect(resolveWorkspacePath('./slides/../报告\\final #1%20.pptx', '/home/me/project', platform)).toBe('/home/me/project/报告\\final #1%20.pptx');
    expect(resolveWorkspacePath('file:///home/me/report%2520%23.pptx', '', platform)).toBe('/home/me/report%20#.pptx');
    expect(() => resolveWorkspacePath('file://server/share/deck.pptx', '', platform)).toThrow();
    expect(() => resolveWorkspacePath('C:\\Users\\deck.pptx', '', platform)).toThrow();
  });
  test('rejects drive-relative and root-relative Windows paths rather than guessing a drive', () => {
    for (const input of ['C:deck.pptx', '\\deck.pptx', '/deck.pptx', '\\\\server', 'file:///C:/deck.pptx#fragment']) {
      expect(() => resolveWorkspacePath(input, 'D:\\project', 'win32')).toThrow();
    }
  });
  test('preserves explicit Windows long paths', () => {
    const input = '\\\\?\\C:\\very long path\\演示.pptx';
    expect(resolveWorkspacePath(input, '', 'win32')).toBe(input);
  });
  test('passes resolved Windows paths through the IPC boundary unchanged', async () => {
    const statFile = vi.fn().mockResolvedValue({ success: true, isFile: true });
    vi.stubGlobal('window', { electron: { platform: 'win32', dialog: { statFile } } });
    await expect(loadLocalFileArtifact('.\\deck.pptx', 'D:\\work')).resolves.toMatchObject({ filePath: 'D:/work/deck.pptx', fileName: 'deck.pptx' });
    expect(statFile).toHaveBeenCalledWith('D:/work/deck.pptx');
  });
  test('validates directories and never accepts a file as a project folder', async () => {
    const statFile = vi.fn().mockResolvedValue({ success: true, isDirectory: true });
    vi.stubGlobal('window', { electron: { platform: 'darwin', dialog: { statFile } } });
    await expect(validateProjectDirectory('file:///work/My%20Project')).resolves.toBe('/work/My Project');
    expect(statFile).toHaveBeenCalledWith('/work/My Project');
    statFile.mockResolvedValue({ success: true, isFile: true });
    await expect(validateProjectDirectory('/work/file.txt')).rejects.toThrow();
    await expect(validateProjectDirectory('')).resolves.toBe('');
  });
  test('loads a real file reference without corrupting its name and rejects missing files', async () => {
    const statFile = vi.fn().mockResolvedValue({ success: true, isFile: true, mtimeMs: 42 });
    vi.stubGlobal('window', { electron: { platform: 'darwin', dialog: { statFile } } });
    await expect(loadLocalFileArtifact('方案 #1.PPTX', '/work')).resolves.toMatchObject({ type: 'document', filePath: '/work/方案 #1.PPTX', contentVersion: 42 });
    statFile.mockResolvedValue({ success: false });
    await expect(loadLocalFileArtifact('/missing.pptx')).rejects.toThrow();
  });
});
