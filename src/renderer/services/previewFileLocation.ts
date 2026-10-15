import { resolveWorkspacePath } from './workspacePath';

/** Display only: this must never be used to authorize or open a file. */
export function getPreviewFileLocation(filePath?: string): { path: string; folder: string } | null {
  if (!filePath) return null;
  let path: string;
  try {
    path = resolveWorkspacePath(filePath);
  } catch {
    // Inline results and unresolved references have no filesystem location yet.
    return null;
  }
  const windows = /^(?:[A-Za-z]:|\\\\|\/\/)/.test(path);
  const parts = (windows ? path.replace(/\\/g, '/') : path).split('/').filter(Boolean);
  return { path, folder: parts.length > 1 ? parts[parts.length - 2] : '' };
}
