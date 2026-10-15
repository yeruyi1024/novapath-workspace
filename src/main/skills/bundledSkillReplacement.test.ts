import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { recoverBundledSkillReplacementSync, replaceBundledSkillSync } from './bundledSkillReplacement';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starpath-skill-'));
  roots.push(root);
  const source = path.join(root, 'bundled', 'docx');
  const target = path.join(root, 'user', 'SKILLs', 'docx');
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(source, 'SKILL.md'), 'new');
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'old');
  fs.writeFileSync(path.join(target, 'user-document.docx'), 'user data');
  fs.writeFileSync(path.join(target, '.env'), 'test placeholder');
  return { root, source, target };
}
describe('bundled skill replacement', () => {
  test('preserves compiled output freshness through an atomic upgrade when requested', () => {
    const { source, target } = fixture();
    for (const [file, time] of [
      ['server/index.ts', new Date('2026-10-01T00:00:00Z')],
      ['dist/server/index.js', new Date('2026-10-02T00:00:00Z')],
    ] as const) {
      fs.mkdirSync(path.dirname(path.join(source, file)), { recursive: true });
      fs.writeFileSync(path.join(source, file), file);
      fs.utimesSync(path.join(source, file), time, time);
    }
    replaceBundledSkillSync(source, target, { preserveTimestamps: true });
    expect(fs.statSync(path.join(target, 'server/index.ts')).mtimeMs)
      .toBeLessThan(fs.statSync(path.join(target, 'dist/server/index.js')).mtimeMs);
    expect(fs.readFileSync(path.join(target, '.env'), 'utf8')).toBe('test placeholder');
  });
  test('recovers an interrupted rename before the next sync', () => {
    const { root, target } = fixture();
    const transaction = path.join(root, 'user', 'skill-backups', 'docx-interrupted');
    fs.mkdirSync(transaction, { recursive: true });
    fs.writeFileSync(path.join(transaction, 'replacement.json'), JSON.stringify({ target }));
    fs.renameSync(target, path.join(transaction, 'previous'));
    const damaged = path.join(root, 'user', 'skill-backups', 'docx-damaged');
    fs.mkdirSync(path.join(damaged, 'previous'), { recursive: true });
    fs.writeFileSync(path.join(damaged, 'replacement.json'), 'invalid JSON');
    fs.utimesSync(damaged, new Date(), new Date(Date.now() + 1000));
    recoverBundledSkillReplacementSync(target);
    expect(fs.readFileSync(path.join(target, '.env'), 'utf8')).toBe('test placeholder');
    expect(fs.readFileSync(path.join(target, 'user-document.docx'), 'utf8')).toBe('user data');
  });
  test('keeps the complete old directory outside skill discovery and retains credentials', () => {
    const { source, target } = fixture();
    const backup = replaceBundledSkillSync(source, target);
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toBe('new');
    expect(fs.readFileSync(path.join(target, '.env'), 'utf8')).toBe('test placeholder');
    expect(fs.readFileSync(path.join(backup, 'user-document.docx'), 'utf8')).toBe('user data');
    expect(fs.readdirSync(path.dirname(target))).toEqual(['docx']);
  });
  test('missing entrypoint leaves the old directory intact', () => {
    const { source, target } = fixture();
    fs.unlinkSync(path.join(source, 'SKILL.md'));
    expect(() => replaceBundledSkillSync(source, target)).toThrow('entrypoint');
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toBe('old');
  });
  test('failed final rename restores old scripts and user data', () => {
    const { source, target } = fixture();
    const original = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (path.basename(String(from)) === 'staged') throw new Error('Test disk failure');
      return original(from, to);
    });
    expect(() => replaceBundledSkillSync(source, target)).toThrow('Test disk failure');
    expect(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8')).toBe('old');
    expect(fs.readFileSync(path.join(target, 'user-document.docx'), 'utf8')).toBe('user data');
  });
});
