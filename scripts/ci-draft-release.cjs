'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hashFile, readJson, rootDir, targets } = require('./ci-common.cjs');

function releaseContext(pkg, env = process.env) {
  const sourceCommit = env.GITHUB_SHA;
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('Missing release source commit.');
  const repository = env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('Missing or invalid release repository.');
  const tag = env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME
    : env.CI_RELEASE_TAG || `v${pkg.version}-ci.${env.GITHUB_RUN_ID}`;
  if (!/^v[0-9][A-Za-z0-9._-]*$/.test(tag)) throw new Error(`Invalid release tag: ${tag}`);
  return { repository, sourceCommit, tag, version: pkg.version };
}

function invokeGh(args) {
  if (args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('Invalid GitHub CLI argument.');
  return spawnSync('gh', args, {
    cwd: rootDir, encoding: 'utf8', shell: false,
    timeout: args[0] === 'api' ? 30_000 : 1_200_000, maxBuffer: 8 * 1024 * 1024,
  });
}

function api(gh, method, endpoint, fields = [], allowMissing = false) {
  const args = ['api', '--include', '--method', method, endpoint];
  for (const field of fields) args.push('-f', field);
  const result = gh(args);
  if (result.error || result.signal || !Number.isInteger(result.status)) throw new Error(`GitHub API failed for ${endpoint}: ${result.error?.message || result.signal || 'missing exit status'}`);
  const stdout = result.stdout || '';
  const status = /^HTTP\/\S+\s+(\d{3})[^\r\n]*\r?\n/.exec(stdout);
  const separator = /\r?\n\r?\n/.exec(stdout);
  if (!status || !separator) throw new Error(`Missing GitHub API HTTP status for ${endpoint}.`);
  const httpStatus = Number(status[1]);
  if (allowMissing && httpStatus === 404 && result.status !== 0) return null;
  const expected = method === 'POST' ? 201 : 200;
  if (result.status !== 0 || httpStatus !== expected) {
    throw new Error(`GitHub API ${method} ${endpoint} failed (HTTP ${httpStatus}, exit ${result.status}): ${result.stderr || ''}`);
  }
  return JSON.parse(stdout.slice(separator.index + separator[0].length));
}

function remoteTag(context, gh = invokeGh) {
  const ref = api(gh, 'GET', `repos/${context.repository}/git/ref/tags/${context.tag}`, [], true);
  if (!ref) return null;
  if (ref.ref !== `refs/tags/${context.tag}`) throw new Error('Remote tag reference differs from requested tag.');
  let object = ref.object;
  const visited = new Set();
  for (let depth = 0; depth <= 8; depth += 1) {
    if (!object || !/^[a-f0-9]{40}$/.test(object.sha || '')) throw new Error('Invalid remote tag object SHA.');
    if (object.type === 'commit') {
      if (object.sha !== context.sourceCommit) throw new Error(`Tag ${context.tag} points to another commit; refusing these packages.`);
      return { ref: ref.ref, sourceCommit: object.sha };
    }
    if (object.type !== 'tag' || depth === 8 || visited.has(object.sha)) throw new Error('Remote tag cannot be resolved to a commit within eight tag objects.');
    visited.add(object.sha);
    const annotated = api(gh, 'GET', `repos/${context.repository}/git/tags/${object.sha}`);
    if (annotated.sha !== object.sha) throw new Error('Annotated tag API returned another object.');
    object = annotated.object;
  }
  throw new Error('Unresolved remote tag.');
}

function existingRelease(context, gh = invokeGh) {
  // The by-tag REST endpoint returns 404 for drafts. List authenticated releases
  // instead, and refuse incomplete discovery rather than treating it as absent.
  for (let page = 1; page <= 10; page += 1) {
    const releases = api(gh, 'GET', `repos/${context.repository}/releases?per_page=100&page=${page}`);
    if (!Array.isArray(releases) || releases.some(release => !release || typeof release !== 'object' || Array.isArray(release))) throw new Error('Invalid releases API list.');
    const matches = releases.filter(release => release.tag_name === context.tag);
    if (matches.length > 1) throw new Error('Duplicate release tag in API list.');
    if (matches.length === 1) return matches[0];
    if (releases.length < 100) return null;
  }
  throw new Error('Release discovery exceeded ten pages; refusing to assume a draft is absent.');
}

function sourceStamp(context) {
  return `Unsigned LobsterAI ${context.version} build from commit ${context.sourceCommit}.`;
}

function assertDraftSource(context, tag, release) {
  if (!release) return;
  if (release.draft !== true) throw new Error('Refusing to replace files on a published release.');
  if (typeof release.target_commitish !== 'string' || !release.target_commitish.trim()) throw new Error('Invalid existing draft source hint.');
  if (release.target_commitish === context.sourceCommit) return;
  const stamps = typeof release.body === 'string'
    ? release.body.split(/\r?\n/).filter(line => /^Unsigned LobsterAI .+ build from commit [a-f0-9]{40}\.$/.test(line)) : [];
  if (!tag || stamps.length !== 1 || stamps[0] !== sourceStamp(context)) {
    throw new Error(`Draft release ${context.tag} targets another commit or lacks its exact source stamp; refusing these packages.`);
  }
}

function prepareTag(context, gh = invokeGh) {
  const tag = remoteTag(context, gh);
  const release = existingRelease(context, gh);
  assertDraftSource(context, tag, release);
  if (tag) return tag;
  // Without a pre-existing tag, only the draft's exact source hint is authority.
  // Never create a tag first and then use it to take over an unrelated draft.
  const created = api(gh, 'POST', `repos/${context.repository}/git/refs`, [
    `ref=refs/tags/${context.tag}`, `sha=${context.sourceCommit}`,
  ]);
  if (created.ref !== `refs/tags/${context.tag}` || created.object?.type !== 'commit'
    || created.object.sha !== context.sourceCommit) throw new Error('Created tag differs from the requested source.');
  return { ref: created.ref, sourceCommit: created.object.sha };
}

function publishArtifacts(context, files, notes, gh = invokeGh) {
  const tag = remoteTag(context, gh);
  const release = existingRelease(context, gh);
  assertDraftSource(context, tag, release);
  if (!tag) throw new Error('Missing verified remote tag; run --prepare-tag before building.');
  const commands = release
    ? [['release', 'upload', context.tag, ...files, '--clobber', '--repo', context.repository],
      ['release', 'edit', context.tag, '--notes-file', notes, '--repo', context.repository]]
    : [['release', 'create', context.tag, ...files, '--draft', '--verify-tag', '--repo', context.repository,
      '--title', `LobsterAI ${context.version} (${context.tag})`, '--notes-file', notes]];
  for (const args of commands) {
    console.log(`[ci-release] gh ${args.join(' ')}`);
    const result = gh(args);
    if (result.error || result.status !== 0 || result.signal) throw new Error(`gh release failed (exit=${result.status}, signal=${result.signal}): ${result.error?.message || result.stderr || ''}`);
  }
}

async function main(options = {}) {
  const directory = options.directory || rootDir;
  const env = options.env || process.env;
  const args = options.args || process.argv.slice(2);
  const gh = options.gh || invokeGh;
  const pkg = readJson(path.join(directory, 'package.json'));
  const context = releaseContext(pkg, env);
  if (args.some(arg => arg !== '--prepare-tag') || args.length > 1) throw new Error('Unsupported release arguments.');
  if (args.includes('--prepare-tag')) {
    const tag = prepareTag(context, gh);
    console.log(`[ci-release] Prepared ${tag.ref} at ${tag.sourceCommit}.`);
    return;
  }
  const selected = JSON.parse(env.CI_BUILD_TARGETS || '[]');
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !targets.some(entry => entry.target === id))) {
    throw new Error('Draft release requires a valid selected-target list.');
  }
  const { sourceCommit } = context;
  const files = [];
  const names = new Set();
  for (const id of selected) {
    const artifactDirectory = path.join(directory, 'artifacts', `lobsterai-${id}`);
    const metadataName = `build-metadata-${id}.json`;
    const metadata = readJson(path.join(artifactDirectory, metadataName));
    if (metadata.target !== id || metadata.sourceCommit !== sourceCommit || metadata.version !== pkg.version) {
      throw new Error(`Artifact metadata differs from the requested source for ${id}.`);
    }
    if (!Array.isArray(metadata.artifacts) || !metadata.artifacts.length) {
      throw new Error(`Missing artifact manifest for ${id}.`);
    }
    const sumsName = `SHA256SUMS-${id}.txt`;
    const expectedChecksums = new Map([[metadataName, await hashFile(path.join(artifactDirectory, metadataName))]]);
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
      const location = path.join(artifactDirectory, name);
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
    const sums = fs.readFileSync(path.join(artifactDirectory, sumsName), 'utf8').trimEnd().split('\n');
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
      files.push(path.join(artifactDirectory, name));
    }
  }
  const notes = path.join(directory, 'artifacts', 'release-notes.md');
  fs.writeFileSync(notes, `${sourceStamp(context)}\n\n`
    + `Built on GitHub hosted runners for: ${selected.join(', ')}. Each target includes SHA-256 checksums and build metadata.\n\n`
    + 'These installers are not code signed or Apple notarized. Review and test before publishing this draft.\n\n'
    + 'The bundled OpenClaw gateway passed the startup readiness smoke gate with channel plugins disabled; live channel credentials are not tested.\n\n'
    + (selected.includes('linux-x64') ? 'Linux packaging is experimental: upstream does not configure a Linux dsh runtime download.\n' : ''));
  publishArtifacts(context, files, notes, gh);
}

module.exports = { releaseContext, remoteTag, existingRelease, sourceStamp, assertDraftSource, prepareTag, publishArtifacts, main };
if (require.main === module) main().catch(error => { console.error('[ci-release]', error); process.exitCode = 1; });
