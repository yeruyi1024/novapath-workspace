'use strict';

const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const OWNED_DOCUMENT_VERSIONS = { docx: '2.0.0', xlsx: '2.0.0', pptx: '2.0.1', pdf: '2.0.1' };
const OWNED_DOCUMENT_SKILLS = Object.keys(OWNED_DOCUMENT_VERSIONS);
const RESTRICTED = /ADDITIONAL RESTRICTIONS|Distribute, sublicense, or transfer these materials/i;

function inspectDocumentTree(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Document skill must not contain external links: ${fullPath}`);
    if (entry.isDirectory()) inspectDocumentTree(fullPath);
    else if (/\.(md|txt|py|js)$/i.test(entry.name) && RESTRICTED.test(fs.readFileSync(fullPath, 'utf8'))) {
      throw new Error(`Restricted bundled skill material: ${fullPath}`);
    }
  }
}

function verifyBundledSkillLicenses(root = path.join(__dirname, '..')) {
  const skillRoot = path.join(root, 'SKILLs');
  for (const entry of fs.readdirSync(skillRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(skillRoot, entry.name);
    const skillFile = path.join(directory, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const text = fs.readFileSync(skillFile, 'utf8');
    const match = /^---\r?\n([\s\S]+?)\r?\n---/.exec(text);
    if (!match) throw new Error(`Skill frontmatter missing: ${entry.name}`);
    const metadata = yaml.load(match[1]);
    const licenseFile = path.join(directory, 'LICENSE.txt');
    const license = fs.existsSync(licenseFile) ? fs.readFileSync(licenseFile, 'utf8') : '';
    if (/proprietary/i.test(metadata.license || '') || RESTRICTED.test(license)) {
      throw new Error(`Restricted bundled skill must not be distributed: ${entry.name}`);
    }
    if (OWNED_DOCUMENT_SKILLS.includes(entry.name)) {
      if (metadata.license !== 'MIT' || metadata.metadata?.author !== 'StarPath'
          || metadata.metadata?.version !== OWNED_DOCUMENT_VERSIONS[entry.name] || !license.includes('StarPath contributors')) {
        throw new Error(`Document skill ownership declaration missing: ${entry.name}`);
      }
      const forbidden = ['ooxml', 'html2pptx.md', 'docx-js.md', 'forms.md', 'reference.md', 'recalc.py'];
      if (forbidden.some(name => fs.existsSync(path.join(directory, name)))) {
        throw new Error(`Legacy restricted material still in bundle: ${entry.name}`);
      }
      inspectDocumentTree(directory);
    }
  }
  for (const name of OWNED_DOCUMENT_SKILLS) {
    if (!fs.existsSync(path.join(skillRoot, name, 'SKILL.md'))) throw new Error(`Required document skill missing: ${name}`);
  }
  if (!fs.existsSync(path.join(skillRoot, 'local-tools/scripts/starpath_document_io.py'))) {
    throw new Error('Shared StarPath document helper missing');
  }
  const fonts = path.join(skillRoot, 'canvas-design', 'canvas-fonts');
  if (fs.existsSync(fonts)) {
    for (const file of fs.readdirSync(fonts).filter(name => /\.(ttf|otf)$/i.test(name))) {
      const family = file.split('-')[0];
      const notice = path.join(fonts, `${family}-OFL.txt`);
      if (!fs.existsSync(notice) || !fs.readFileSync(notice, 'utf8').includes('SIL OPEN FONT LICENSE')) {
        throw new Error(`Font license missing: ${file}`);
      }
    }
  }
  return { documentSkills: OWNED_DOCUMENT_SKILLS.length };
}

if (require.main === module) console.log(JSON.stringify(verifyBundledSkillLicenses()));
module.exports = { verifyBundledSkillLicenses };
