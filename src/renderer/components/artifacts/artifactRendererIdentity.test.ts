import { describe, expect, test } from 'vitest';

import { type Artifact, ArtifactTypeValue } from '../../types/artifact';
import { artifactRendererBoundaryKey } from './artifactRendererIdentity';

const markdown = {
  id: 'document-1', type: ArtifactTypeValue.Markdown,
  filePath: '/workspace/notes.md', contentVersion: 1,
} as Pick<Artifact, 'id' | 'type' | 'filePath' | 'contentVersion'>;

describe('artifact renderer identity', () => {
  test('keeps an editable Markdown document mounted across source switches and saved versions', () => {
    const key = artifactRendererBoundaryKey(markdown, false, true);
    expect(artifactRendererBoundaryKey(markdown, true, true)).toBe(key);
    expect(artifactRendererBoundaryKey({ ...markdown, contentVersion: 2 }, false, true)).toBe(key);
    expect(artifactRendererBoundaryKey({ ...markdown, filePath: '/workspace/other.md' }, false, true)).not.toBe(key);
  });

  test('still resets other renderers when their content or view changes', () => {
    const key = artifactRendererBoundaryKey(markdown, false, false);
    expect(artifactRendererBoundaryKey(markdown, true, false)).not.toBe(key);
    expect(artifactRendererBoundaryKey({ ...markdown, contentVersion: 2 }, false, false)).not.toBe(key);
    expect(artifactRendererBoundaryKey({ ...markdown, type: ArtifactTypeValue.Text }, true, true)).not.toBe(key);
  });
});
