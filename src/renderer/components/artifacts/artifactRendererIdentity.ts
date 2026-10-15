import { type Artifact, ArtifactTypeValue } from '../../types/artifact';

type PreviewIdentity = Pick<Artifact, 'id' | 'type' | 'filePath' | 'contentVersion'>;

/** Keep a file-backed Markdown editor mounted across mode and content updates. */
export function artifactRendererBoundaryKey(
  artifact: PreviewIdentity,
  sourceView: boolean,
  markdownEditingAvailable: boolean,
): string {
  if (markdownEditingAvailable && artifact.type === ArtifactTypeValue.Markdown && artifact.filePath) {
    return JSON.stringify([artifact.id, artifact.filePath]);
  }
  return JSON.stringify([artifact.id, artifact.contentVersion ?? null, sourceView]);
}
