import { expect, test } from 'vitest';

import { resolveTruncatedFileLink } from './resolveTruncatedFileLink';

test('recovers the reported shortened directory with a Chinese filename and spaces', () => {
  const path = '/Users/test/lobsterai/project/密测14 中文 文件 20261014.txt';
  expect(resolveTruncatedFileLink('/Use…ect/密测14 中文 文件 20261014.txt', [path, path])).toBe(path);
  expect(resolveTruncatedFileLink('/Use...ect/密测14 中文 文件 20261014.txt', [path])).toBe(path);
});

test('does not guess when paths are missing, mismatched or ambiguous', () => {
  const link = '/Use…ect/report.txt';
  expect(resolveTruncatedFileLink(link, [])).toBeNull();
  expect(resolveTruncatedFileLink(link, ['/tmp/project/report.txt'])).toBeNull();
  expect(resolveTruncatedFileLink(link, ['/Users/a/project/report.txt', '/Users/b/project/report.txt'])).toBeNull();
});

test('leaves ordinary paths and literal ellipses in filenames alone', () => {
  expect(resolveTruncatedFileLink('/Users/a/project/report.txt', ['/Users/a/project/report.txt'])).toBeNull();
  expect(resolveTruncatedFileLink('/Users/a/project/report….txt', ['/Users/a/project/report….txt'])).toBeNull();
  expect(resolveTruncatedFileLink('/Users/a/project/report...txt', ['/Users/a/project/report...txt'])).toBeNull();
  expect(resolveTruncatedFileLink('https://example.com/report.txt', ['/Users/a/project/report.txt'])).toBeNull();
});

test('supports Windows separators without changing the known path', () => {
  const path = 'C:\\Users\\test\\project\\中文 file.txt';
  expect(resolveTruncatedFileLink('C:/Use…ect/中文 file.txt', [path])).toBe(path);
});
