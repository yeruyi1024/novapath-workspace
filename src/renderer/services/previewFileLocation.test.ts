import { describe, expect, test } from 'vitest';

import { getPreviewFileLocation } from './previewFileLocation';

describe('preview file location', () => {
  test('shows the immediate parent without exposing a long directory tree', () => {
    expect(getPreviewFileLocation('/projects/星途/成果/report.docx')).toEqual({
      path: '/projects/星途/成果/report.docx', folder: '成果',
    });
  });
  test('decodes file URLs once and preserves literal percent sequences in native paths', () => {
    expect(getPreviewFileLocation('file:///projects/Project%20A/summary.pdf')?.folder).toBe('Project A');
    expect(getPreviewFileLocation('/projects/Project%20A/summary.pdf')?.folder).toBe('Project%20A');
  });
  test('handles Windows drive and network share paths', () => {
    expect(getPreviewFileLocation('C:\\Projects\\成果\\deck.pptx')?.folder).toBe('成果');
    expect(getPreviewFileLocation('\\\\server\\share\\成果\\deck.pptx')?.folder).toBe('成果');
  });
  test('preserves backslashes in POSIX folder names', () => {
    expect(getPreviewFileLocation('/projects/a\\b/report.docx')?.folder).toBe('a\\b');
  });
  test('root files have no parent label', () => {
    expect(getPreviewFileLocation('/report.pdf')).toEqual({ path: '/report.pdf', folder: '' });
  });
  test('does not label unresolved or invalid references as a resolved file', () => {
    for (const path of [undefined, '', 'report.pdf', 'https://example.com/report.pdf', 'file:///report.pdf?token=secret']) {
      expect(getPreviewFileLocation(path)).toBeNull();
    }
  });
});
