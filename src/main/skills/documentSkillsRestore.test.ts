import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ root: '', appRoot: '' }));
vi.mock('electron', () => ({
  app: { getPath: () => fixture.root, getAppPath: () => fixture.appRoot, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
  session: { defaultSession: { webRequest: { onBeforeSendHeaders: vi.fn() } } },
}));

import type { SqliteStore } from '../sqliteStore';
import { SkillManager } from './skillManager';

const restoredEntries = {
  docx: 'scripts/document.py',
  pptx: 'scripts/html2pptx.js',
  pdf: 'scripts/fill_pdf_form_with_annotations.py',
  xlsx: 'recalc.py',
};
let manager: SkillManager;
let bundledRoot: string;

beforeEach(() => {
  fixture.root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'novapath-document-restore-')));
  fixture.appRoot = path.join(fixture.root, 'app');
  bundledRoot = path.join(fixture.appRoot, 'SKILLs');
  for (const id of Object.keys(restoredEntries)) {
    fs.cpSync(path.resolve('SKILLs', id), path.join(bundledRoot, id), {
      recursive: true,
      filter: source => !source.split(path.sep).includes('node_modules'),
    });
  }
  fs.writeFileSync(path.join(bundledRoot, 'skills.config.json'), JSON.stringify({
    defaults: Object.fromEntries(Object.keys(restoredEntries).map(id => [id, { enabled: true }])),
  }));
  manager = new SkillManager(() => ({ get: () => undefined, set: () => undefined } as unknown as SqliteStore));
  vi.spyOn(manager as unknown as { getBundledSkillsRoot: () => string }, 'getBundledSkillsRoot')
    .mockReturnValue(bundledRoot);
});

afterEach(() => {
  manager.stopWatching();
  vi.restoreAllMocks();
  fs.rmSync(fixture.root, { recursive: true, force: true });
});

test('restored document capabilities are installed and discoverable by the existing manager', () => {
  manager.syncBundledSkillsToUserData();
  const skills = manager.listSkills();
  for (const [id, entry] of Object.entries(restoredEntries)) {
    const skill = skills.find(item => item.id === id);
    expect(skill?.enabled).toBe(true);
    expect(skill?.prompt).toContain('星途本地恢复运行说明');
    expect(fs.existsSync(path.join(manager.getSkillsRoot(), id, entry))).toBe(true);
    expect(fs.readFileSync(path.join(manager.getSkillsRoot(), id, 'LICENSE.txt'), 'utf8'))
      .toContain('ADDITIONAL RESTRICTIONS');
  }
});

test('restoration replaces 2.0.x skills through existing backups and preserves credentials', () => {
  for (const id of Object.keys(restoredEntries)) {
    const directory = path.join(manager.getSkillsRoot(), id);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), [
      '---', `name: ${id}`, 'description: Previous restricted-capability version',
      'metadata:', '  version: 2.0.1', '---', 'Previous body',
    ].join('\n'));
    fs.writeFileSync(path.join(directory, '.env'), 'RESTORE_TEST=placeholder');
    fs.writeFileSync(path.join(directory, 'accounts.json'), '{"fixture":true}');
  }
  manager.syncBundledSkillsToUserData();
  for (const [id, entry] of Object.entries(restoredEntries)) {
    const directory = path.join(manager.getSkillsRoot(), id);
    expect(fs.existsSync(path.join(directory, entry))).toBe(true);
    expect(fs.readFileSync(path.join(directory, '.env'), 'utf8')).toBe('RESTORE_TEST=placeholder');
    expect(fs.readFileSync(path.join(directory, 'accounts.json'), 'utf8')).toBe('{"fixture":true}');
    const backup = fs.readdirSync(path.join(fixture.root, 'skill-backups')).find(name => name.startsWith(`${id}-`));
    expect(backup).toBeDefined();
    expect(fs.readFileSync(path.join(fixture.root, 'skill-backups', backup!, 'previous/SKILL.md'), 'utf8'))
      .toContain('Previous body');
  }
});

test('subsequent startup retains restored definitions without another replacement', () => {
  manager.syncBundledSkillsToUserData();
  manager.syncBundledSkillsToUserData();
  expect(fs.existsSync(path.join(fixture.root, 'skill-backups'))).toBe(false);
  expect(manager.listSkills().filter(skill => skill.enabled)).toHaveLength(4);
});
