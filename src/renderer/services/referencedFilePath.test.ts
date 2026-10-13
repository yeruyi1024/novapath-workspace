import { afterEach, describe, expect, test, vi } from 'vitest';

import { resolveReferencedFilePath } from './referencedFilePath';

afterEach(() => vi.unstubAllGlobals());

describe('abbreviated reply file references', () => {
  test.each([
    ['darwin', 'file:///Use…ect/报告.pdf', '/work/project', '/work/project/报告.pdf'],
    ['linux', '/home/.../报告.pdf', '/home/me/project', '/home/me/project/报告.pdf'],
    ['win32', 'C:\\Use…ect\\报告.pdf', 'D:\\project', 'D:/project/报告.pdf'],
  ])('recovers only a verified file in this conversation directory on %s', async (platform, input, cwd, output) => {
    const statFile = vi.fn().mockResolvedValueOnce({ success: false }).mockResolvedValue({ success: true, isFile: true });
    vi.stubGlobal('window', { electron: { platform, dialog: { statFile } } });
    await expect(resolveReferencedFilePath(input, cwd)).resolves.toBe(output);
    expect(statFile).toHaveBeenLastCalledWith(output);
    expect(statFile).toHaveBeenCalledTimes(2);
  });

  test.each(['/other/missing.pdf', '/Use…ect/missing.pdf'])('never recovers an unverified or non-abbreviated reference: %s', async input => {
    const statFile = vi.fn().mockResolvedValue({ success: false });
    vi.stubGlobal('window', { electron: { platform: 'darwin', dialog: { statFile } } });
    await expect(resolveReferencedFilePath(input, '/work')).rejects.toThrow();
    expect(statFile).toHaveBeenCalledTimes(input.includes('…') ? 2 : 1);
  });

  test('uses the literal original if it really exists and rejects recovery without a project', async () => {
    const statFile = vi.fn().mockResolvedValue({ success: true, isFile: true });
    vi.stubGlobal('window', { electron: { platform: 'darwin', dialog: { statFile } } });
    await expect(resolveReferencedFilePath('/work/…/file.pdf', '/work')).resolves.toBe('/work/…/file.pdf');
    expect(statFile).toHaveBeenCalledTimes(1);
    statFile.mockResolvedValue({ success: false });
    await expect(resolveReferencedFilePath('/Use…ect/file.pdf')).rejects.toThrow();
    expect(statFile).toHaveBeenCalledTimes(2);
  });
});
