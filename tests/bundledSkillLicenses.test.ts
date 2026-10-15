import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { verifyBundledSkillLicenses } = require('../scripts/verify-bundled-skill-licenses.cjs');
const { packSingleSource } = require('../scripts/pack-openclaw-tar.cjs');
const tar = require('tar');
const roots: string[] = [];
const repo = path.resolve(__dirname, '..');
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'starpath-license-'));
  roots.push(root);
  // A permissive distribution candidate is separate from the restored local
  // source tree. Keep exercising the unchanged release guard without relabeling
  // the original third-party materials in the repository.
  for (const skill of ['docx', 'pptx', 'xlsx', 'pdf']) {
    const directory = path.join(root, 'SKILLs', skill);
    fs.mkdirSync(directory, { recursive: true });
    const version = skill === 'pptx' || skill === 'pdf' ? '2.0.1' : '2.0.0';
    fs.writeFileSync(path.join(directory, 'SKILL.md'), [
      '---', `name: ${skill}`, 'description: Distribution test fixture', 'license: MIT',
      'metadata:', '  author: StarPath', `  version: ${version}`, '---', '',
    ].join('\n'));
    fs.copyFileSync(path.join(repo, 'SKILLs', skill, 'LICENSE.starpath.txt'), path.join(directory, 'LICENSE.txt'));
  }
  fs.cpSync(path.join(repo, 'SKILLs/local-tools'), path.join(root, 'SKILLs/local-tools'), { recursive: true });
  return root;
}
test('restored local document skills remain blocked from distribution', () => {
  expect(() => verifyBundledSkillLicenses(repo)).toThrow('Restricted bundled skill');
});
test('a separately prepared permissive candidate passes the unchanged ownership guard', () => {
  expect(verifyBundledSkillLicenses(fixture())).toEqual({ documentSkills: 4 });
});
test('restricted material reintroduced into a bundle blocks packaging', () => {
  const root = fixture();
  fs.appendFileSync(path.join(root, 'SKILLs/docx/LICENSE.txt'), '\nADDITIONAL RESTRICTIONS');
  expect(() => verifyBundledSkillLicenses(root)).toThrow('Restricted bundled skill');
});
test('legacy helper trees cannot silently reenter the document bundle', () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, 'SKILLs/pptx/ooxml'));
  expect(() => verifyBundledSkillLicenses(root)).toThrow('Legacy restricted material');
});
test('nested restricted notices cannot bypass the bundle guard', () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, 'SKILLs/pdf/extra'));
  fs.writeFileSync(path.join(root, 'SKILLs/pdf/extra/LICENSE.txt'), 'ADDITIONAL RESTRICTIONS');
  expect(() => verifyBundledSkillLicenses(root)).toThrow('Restricted bundled skill material');
});
test('a shipped font requires its matching license notice', () => {
  const root = fixture();
  const fonts = path.join(root, 'SKILLs/canvas-design/canvas-fonts');
  fs.mkdirSync(fonts, { recursive: true });
  fs.writeFileSync(path.join(fonts, 'Fixture-Regular.ttf'), 'test placeholder');
  expect(() => verifyBundledSkillLicenses(root)).toThrow('Font license missing');
  fs.writeFileSync(path.join(fonts, 'Fixture-OFL.txt'), 'SIL OPEN FONT LICENSE');
  expect(verifyBundledSkillLicenses(root)).toEqual({ documentSkills: 4 });
});
test('Windows resource archive keeps license, notice and attribution files', () => {
  const root = fixture();
  const source = path.join(root, 'input');
  fs.mkdirSync(source);
  for (const name of ['LICENSE', 'LICENSE.txt', 'LICENCE.md', 'NOTICE', 'AUTHORS', 'CONTRIBUTORS', 'font-OFL.txt']) {
    fs.writeFileSync(path.join(source, name), name);
  }
  const archive = path.join(root, 'resources.tar');
  packSingleSource(source, archive, 'payload');
  const names: string[] = [];
  tar.list({ file: archive, sync: true, onentry: (entry: { path: string }) => names.push(entry.path) });
  expect(names).toContain('payload/LICENSE');
  expect(names).toContain('payload/NOTICE');
  expect(names).toContain('payload/AUTHORS');
  expect(names).toContain('payload/font-OFL.txt');
});
test('runtime pruning preserves notices on packages that remain in the runtime', () => {
  const root = fixture();
  const dependency = path.join(root, 'node_modules', 'fixture-library');
  fs.mkdirSync(dependency, { recursive: true });
  fs.mkdirSync(path.join(root, 'dist/plugin-sdk'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'openclaw', version: '0.0.0', type: 'module',
    exports: { './plugin-sdk': './dist/plugin-sdk/index.js' },
  }));
  fs.writeFileSync(path.join(root, 'dist/plugin-sdk/index.js'), 'export const fixture = true;');
  fs.writeFileSync(path.join(dependency, 'LICENSE'), 'Original copyright');
  fs.writeFileSync(path.join(dependency, 'NOTICE'), 'Attribution');
  const result = spawnSync(process.execPath, [path.join(repo, 'scripts/prune-openclaw-runtime.cjs'), root], { encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  expect(fs.readFileSync(path.join(dependency, 'LICENSE'), 'utf8')).toBe('Original copyright');
  expect(fs.readFileSync(path.join(dependency, 'NOTICE'), 'utf8')).toBe('Attribution');
});
