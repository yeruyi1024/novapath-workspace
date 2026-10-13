import { type Artifact, ArtifactTypeValue } from '../types/artifact';
import { loadDetectedFileArtifact } from './artifactDetection';
import { getArtifactTypeFromExtension } from './artifactParser';
import { resolveReferencedFile } from './referencedFilePath';
import { type DesktopOS, DesktopOS as DesktopOSValue, resolveWorkspacePath } from './workspacePath';

export { resolveReferencedFilePath } from './referencedFilePath';
export { resolveWorkspacePath } from './workspacePath';

export async function validateProjectDirectory(input: string): Promise<string> {
  if (!input.trim()) return '';
  const path = resolveWorkspacePath(input, '', window.electron.platform as DesktopOS);
  const result = await window.electron.dialog.statFile(path);
  if (!result.success || !result.isDirectory) throw new Error('Project directory is unavailable');
  return path;
}

export async function loadLocalFileArtifact(input: string, directory = '', sessionId = ''): Promise<Artifact> {
  const { path: filePath, mtimeMs } = await resolveReferencedFile(input, directory);
  const fileName = filePath.split(window.electron.platform === DesktopOSValue.Windows ? /[\\/]/ : /\//).pop() || filePath;
  const extension = /\.[^.]+$/.exec(fileName)?.[0].toLowerCase() || '';
  const type = getArtifactTypeFromExtension(extension) ?? ArtifactTypeValue.Document;
  const artifact: Artifact = { id: crypto.randomUUID(), messageId: '', sessionId,
    source: 'file', type, title: fileName, fileName, filePath, content: '', createdAt: Date.now(), contentVersion: mtimeMs };
  // Documents read their own bytes; unknown formats show an Open in app fallback.
  if (type === ArtifactTypeValue.Document) return artifact;
  const loaded = await loadDetectedFileArtifact(artifact);
  if (!loaded) throw new Error('File could not be read');
  return loaded;
}
