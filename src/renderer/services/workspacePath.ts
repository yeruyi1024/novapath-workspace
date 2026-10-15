export const DesktopOS = { Windows: 'win32', Mac: 'darwin', Linux: 'linux' } as const;
export type DesktopOS = typeof DesktopOS[keyof typeof DesktopOS];

/** Resolve against an explicit project root, never the process working directory.
 * Native names are not URL-decoded. POSIX backslashes are valid filename characters.
 */
export function resolveWorkspacePath(input: string, directory = '', platform?: DesktopOS): string {
  let path = input.trim();
  if (/^file:/i.test(path)) {
    const url = new URL(path);
    if (url.search || url.hash || url.username || url.password) throw new Error('Invalid local file URL');
    path = decodeURIComponent(url.pathname);
    if (url.hostname && url.hostname !== 'localhost') {
      if (platform && platform !== DesktopOS.Windows) throw new Error('Use a local mount path for network files');
      path = `//${url.hostname}${path}`;
    }
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  }
  if (!path || /[\u0000-\u001f]/.test(path) || path.startsWith('~')) throw new Error('Absolute local path required');
  const windows = platform ? platform === DesktopOS.Windows : /^(?:[A-Za-z]:|\\\\|\/\/[^/])/.test(path || directory) || /^[A-Za-z]:|^\\\\/.test(directory);
  if (/^\\\\\?\\/.test(path)) {
    if (!windows || !/^\\\\\?\\(?:[A-Za-z]:\\|UNC\\[^\\]+\\[^\\]+(?:\\|$))/i.test(path)) throw new Error('Invalid Windows extended path');
    return path;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(path) && !(windows && /^[A-Za-z]:[\\/]/.test(path))) throw new Error('Absolute local path required');
  if (windows) path = path.replace(/\\/g, '/');
  let root = '';
  let relative = path;
  if (windows) {
    const drive = /^[A-Za-z]:\//.exec(path);
    const share = /^\/\/[^/]+\/[^/]+(?:\/|$)/.exec(path);
    if (drive) { root = drive[0]; relative = path.slice(root.length); }
    else if (share) { root = `${share[0].replace(/\/$/, '')}/`; relative = path.slice(share[0].length); }
    else if (path.startsWith('/')) throw new Error('Windows paths require a drive or network share');
  } else if (path.startsWith('/')) { root = '/'; relative = path.slice(1); }
  if (!root) {
    if (!directory) throw new Error('Absolute local path or project folder required');
    const base = resolveWorkspacePath(directory, '', platform);
    return resolveWorkspacePath(`${base.replace(windows ? /[\\/]+$/ : /\/+$/, '')}/${path}`, '', platform);
  }
  const segments: string[] = [];
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return `${root}${segments.join('/')}`;
}
