'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hashFile, readJson, rootDir, run, targets } = require('./ci-common.cjs');

async function main() {
  const pkg = readJson(path.join(rootDir, 'package.json'));
  const selected = JSON.parse(process.env.CI_BUILD_TARGETS || '[]');
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !targets.some(entry => entry.target === id))) {
    throw new Error('Draft release requires a valid selected-target list.');
  }
  const sourceCommit = process.env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('Missing release source commit.');
  const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME
    : process.env.CI_RELEASE_TAG || `v${pkg.version}-ci.${process.env.GITHUB_RUN_ID}`;
  if (!/^v[0-9][A-Za-z0-9._-]*$/.test(tag)) throw new Error(`Invalid release tag: ${tag}`);
  const existingTag = spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], { cwd: rootDir, encoding: 'utf8' });
  if (existingTag.status === 0 && existingTag.stdout.trim() !== sourceCommit) {
    throw new Error(`Tag ${tag} points to another commit; refusing to attach these packages.`);
  }
  const files = [];
  const names = new Set();
  for (const id of selected) {
    const directory = path.join(rootDir, 'artifacts', `lobsterai-${id}`);
    const metadataName = `build-metadata-${id}.json`;
    const metadata = readJson(path.join(directory, metadataName));
    if (metadata.target !== id || metadata.sourceCommit !== sourceCommit || metadata.version !== pkg.version) {
      throw new Error(`Artifact metadata differs from the requested source for ${id}.`);
    }
    if (!Array.isArray(metadata.artifacts) || !metadata.artifacts.length) {
      throw new Error(`Missing artifact manifest for ${id}.`);
    }
    const sumsName = `SHA256SUMS-${id}.txt`;
    const expectedChecksums = new Map([[metadataName, await hashFile(path.join(directory, metadataName))]]);
    for (const artifact of metadata.artifacts) {
      const name = artifact?.filename;
      if (typeof name !== 'string' || !name || name !== path.basename(name)
        || /[/\\\r\n]/.test(name) || name === '.' || name === '..'
        || name === sumsName || expectedChecksums.has(name)) {
        throw new Error(`Unsafe or duplicate manifest filename for ${id}: ${name}`);
      }
      if (!/^[a-f0-9]{64}$/.test(artifact.sha256 || '')
        || !Number.isSafeInteger(artifact.size) || artifact.size <= 0) {
        throw new Error(`Invalid manifest hash or size for ${id}: ${name}`);
      }
      const location = path.join(directory, name);
      const stat = fs.statSync(location);
      if (!stat.isFile() || stat.size !== artifact.size) {
        throw new Error(`Artifact size differs from the manifest for ${id}: ${name}`);
      }
      const actualHash = await hashFile(location);
      if (actualHash !== artifact.sha256) {
        throw new Error(`Artifact hash differs from the manifest for ${id}: ${name}`);
      }
      expectedChecksums.set(name, actualHash);
    }
    const formats = targets.find(entry => entry.target === id).formats;
    for (const format of formats) {
      if (!metadata.artifacts.some(entry => entry.filename.endsWith(format))) throw new Error(`Missing ${id} ${format} in manifest.`);
    }
    const sums = fs.readFileSync(path.join(directory, sumsName), 'utf8').trimEnd().split('\n');
    const verifiedNames = new Set();
    for (const line of sums) {
      const match = /^([a-f0-9]{64})  ([^/\\]+)$/.exec(line);
      if (!match || !expectedChecksums.has(match[2]) || verifiedNames.has(match[2])
        || expectedChecksums.get(match[2]) !== match[1]) {
        throw new Error(`Invalid, unexpected, or duplicate artifact checksum in ${id}: ${line}`);
      }
      verifiedNames.add(match[2]);
    }
    for (const name of expectedChecksums.keys()) {
      if (!verifiedNames.has(name)) throw new Error(`Missing artifact checksum in ${id}: ${name}`);
    }
    for (const name of [metadataName, sumsName, ...metadata.artifacts.map(entry => entry.filename)]) {
      if (name !== path.basename(name) || names.has(name)) throw new Error(`Unsafe or duplicate release filename: ${name}`);
      names.add(name);
      files.push(path.join(directory, name));
    }
  }
  const notes = path.join(rootDir, 'artifacts', 'release-notes.md');
  fs.writeFileSync(notes, `Unsigned LobsterAI ${pkg.version} build from commit ${sourceCommit}.\n\n`
    + `Built on GitHub hosted runners for: ${selected.join(', ')}. Each target includes SHA-256 checksums and build metadata.\n\n`
    + 'These installers are not code signed or Apple notarized. Review and test before publishing this draft.\n\n'
    + 'The bundled OpenClaw gateway passed the startup readiness smoke gate with channel plugins disabled; live channel credentials are not tested.\n\n'
    + (selected.includes('linux-x64') ? 'Linux packaging is experimental: upstream does not configure a Linux dsh runtime download.\n' : ''));
  const view = spawnSync('gh', ['release', 'view', tag, '--json', 'isDraft'], { cwd: rootDir, encoding: 'utf8' });
  if (view.status === 0) {
    if (!JSON.parse(view.stdout).isDraft) throw new Error('Refusing to replace files on a published release.');
    run('gh', ['release', 'upload', tag, ...files, '--clobber']);
    run('gh', ['release', 'edit', tag, '--notes-file', notes]);
  } else {
    run('gh', ['release', 'create', tag, ...files, '--draft', '--target', sourceCommit,
      '--title', `LobsterAI ${pkg.version} (${tag})`, '--notes-file', notes]);
  }
}

main().catch(error => { console.error('[ci-release]', error); process.exitCode = 1; });
