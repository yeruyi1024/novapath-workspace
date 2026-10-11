import { addArtifact, openArtifactPreviewTab } from '../store/slices/artifactSlice';
import { getArtifactTypeFromExtension } from './artifactParser';
import { loadLocalFileArtifact } from './workspaceFiles';

type PreviewAction = ReturnType<typeof addArtifact> | ReturnType<typeof openArtifactPreviewTab>;
interface PreviewContext {
  sessionId: string;
  cwd?: string;
  dispatch: (action: PreviewAction) => unknown;
  isCurrent: () => boolean;
}

/** Return false only when the reference needs the system app instead. */
export async function previewConversationFile(filePath: string, context: PreviewContext): Promise<boolean> {
  const extension = /\.[^./\\]+$/.exec(filePath)?.[0].toLowerCase() ?? '';
  if (!getArtifactTypeFromExtension(extension)) return false;
  const artifact = await loadLocalFileArtifact(filePath, context.cwd, context.sessionId);
  // A slow read from the previous conversation must not reopen its panel.
  if (!context.isCurrent()) return true;
  artifact.id = `conversation-file:${context.sessionId}:${artifact.filePath}`;
  context.dispatch(addArtifact({ sessionId: context.sessionId, artifact, defaultProjectDirectory: context.cwd }));
  context.dispatch(openArtifactPreviewTab({ sessionId: context.sessionId, artifactId: artifact.id }));
  return true;
}
