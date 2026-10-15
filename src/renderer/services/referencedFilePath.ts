import { type DesktopOS, DesktopOS as DesktopOSValue, resolveWorkspacePath } from './workspacePath';

/** Recover only an explicitly abbreviated directory, inside this chat's root. */
export async function resolveReferencedFile(input: string, directory = ''): Promise<{ path: string; mtimeMs?: number }> {
  const platform = window.electron.platform as DesktopOS;
  const path = resolveWorkspacePath(input, directory, platform);
  const stat = await window.electron.dialog.statFile(path);
  if (stat.success && stat.isFile) return { path, mtimeMs: stat.mtimeMs };
  const parts = path.split(platform === DesktopOSValue.Windows ? /[\\/]/ : /\//);
  const name = parts.pop() || '';
  if (!directory || !name || name === '.' || name === '..'
      || !parts.some(part => part.includes('…') || part.includes('...'))) {
    throw new Error('File is unavailable');
  }
  const candidate = resolveWorkspacePath(`./${name}`, directory, platform);
  const candidateStat = await window.electron.dialog.statFile(candidate);
  if (!candidateStat.success || !candidateStat.isFile) throw new Error('File is unavailable');
  return { path: candidate, mtimeMs: candidateStat.mtimeMs };
}


export async function resolveReferencedFilePath(input: string, directory = ''): Promise<string> {
  return (await resolveReferencedFile(input, directory)).path;
}
