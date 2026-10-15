import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ root: '' }));
vi.mock('electron', () => ({ app: { getPath: () => fixture.root, getAppPath: () => path.join(fixture.root, 'app'), isPackaged: false }, BrowserWindow: { getAllWindows: () => [] } }));

import type { SqliteStore } from '../sqliteStore';
import { SkillManager } from './skillManager';

let manager: SkillManager;
let accountsFile: string;
beforeEach(() => {
  fixture.root = fs.mkdtempSync(path.join(os.tmpdir(), 'starpath-email-accounts-'));
  const dir = path.join(fixture.root, 'SKILLs', 'imap-smtp-email');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: imap-smtp-email\ndescription: fixture\n---\n');
  accountsFile = path.join(dir, 'accounts.json');
  manager = new SkillManager(() => ({ get: () => undefined } as unknown as SqliteStore));
});
afterEach(() => { fs.rmSync(fixture.root, { recursive: true, force: true }); });

test('restored email settings preserve existing accounts and credentials when editing', () => {
  const original = { version: 1 as const, defaultAccountId: 'work', accounts: [{ id: 'work', name: '工作邮箱', enabled: true, email: 'fixture@example.invalid', password: 'invalid-fixture-password', imapHost: 'imap.example.invalid', smtpHost: 'smtp.example.invalid' }] };
  fs.writeFileSync(accountsFile, JSON.stringify(original));
  const loaded = manager.getEmailAccountsConfig('imap-smtp-email');
  expect(loaded.success).toBe(true);
  loaded.config!.accounts[0].name = '修改名称';
  expect(manager.setEmailAccountsConfig('imap-smtp-email', loaded.config!).success).toBe(true);
  expect(manager.getEmailAccountsConfig('imap-smtp-email').config?.accounts[0]).toMatchObject({ name: '修改名称', password: original.accounts[0].password });
});

test('corrupted email configuration reports failure without overwriting the file', () => {
  fs.writeFileSync(accountsFile, '{broken');
  expect(manager.getEmailAccountsConfig('imap-smtp-email')).toMatchObject({ success: false });
  expect(fs.readFileSync(accountsFile, 'utf8')).toBe('{broken');
});

test('default account falls back to enabled account and send confirmation remains enabled', () => {
  expect(manager.setEmailAccountsConfig('imap-smtp-email', { version: 1, defaultAccountId: 'off', accounts: [
    { id: 'off', name: 'Disabled', enabled: false, email: 'off@example.invalid' },
    { id: 'on', name: 'Enabled', enabled: true, email: 'on@example.invalid' },
  ] }).success).toBe(true);
  const loaded = manager.getEmailAccountsConfig('imap-smtp-email').config!;
  expect(loaded.defaultAccountId).toBe('on');
  expect(loaded.accounts[1].requireSendConfirmation).toBe(true);
});
