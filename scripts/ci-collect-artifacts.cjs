'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hashFile, readJson, rootDir, targetFromEnv } = require('./ci-common.cjs');
const { resolvePreinstalledPluginDir } = require('./openclaw-runtime-packaging.cjs');

async function main() {
  const target = targetFromEnv();
  const release = path.join(rootDir, 'release');
  const files = fs.readdirSync(release).filter(filename => target.formats.some(format => filename.endsWith(format))
    || filename.endsWith('.blockmap')).filter(filename => fs.statSync(path.join(release, filename)).isFile()).sort();
  for (const format of target.formats) {
    if (!files.some(filename => filename.endsWith(format))) throw new Error(`Missing required ${target.target} installer ${format}.`);
  }
  const output = path.join(rootDir, '.ci-artifacts', target.target);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const checksums = [];
  const packages = [];
  for (const filename of files) {
    const source = path.join(release, filename);
    const size = fs.statSync(source).size;
    if (!size) throw new Error(`Empty installer artifact: ${filename}`);
    const sha256 = await hashFile(source);
    fs.copyFileSync(source, path.join(output, filename));
    checksums.push(`${sha256}  ${filename}`);
    packages.push({ filename, size, sha256 });
  }
  const pkg = readJson(path.join(rootDir, 'package.json'));
  const runtime = path.join(rootDir, 'vendor', 'openclaw-runtime', 'current');
  const runtimeBuild = readJson(path.join(runtime, 'runtime-build-info.json'));
  if (runtimeBuild.target !== target.target || runtimeBuild.openclawVersion !== pkg.openclaw.version) {
    throw new Error('Artifact runtime provenance differs from the selected target/version.');
  }
  const pluginStatus = (pkg.openclaw.plugins || []).map(plugin => ({
    id: plugin.id, version: plugin.version, optional: Boolean(plugin.optional),
    installed: fs.existsSync(path.join(resolvePreinstalledPluginDir(runtime, plugin), 'package.json')),
  }));
  const locks = ['package-lock.json', ...fs.readdirSync(path.join(rootDir, 'SKILLs'))
    .map(name => `SKILLs/${name}/package-lock.json`).filter(filename => fs.existsSync(path.join(rootDir, filename)))];
  const lockHashes = {};
  for (const filename of locks) lockHashes[filename] = await hashFile(path.join(rootDir, filename));
  const metadata = {
    app: pkg.name,
    version: pkg.version,
    target: target.target,
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim(),
    sourceRepository: process.env.GITHUB_REPOSITORY || null,
    runUrl: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    builtAt: new Date().toISOString(),
    toolchain: { node: process.versions.node, npm: '11.17.0', pnpm: '12.1.0', electron: pkg.devDependencies.electron },
    signing: { codeSigned: false, notarized: false },
    dsh: { version: pkg.dsh.version, runtimeDownloadConfigured: Boolean(pkg.dsh.runtimes[target.target]), bundled: false },
    openclaw: { ...runtimeBuild, source: undefined, plugins: pluginStatus },
    dependencyLockSha256: lockHashes,
    artifacts: packages,
  };
  const metadataName = `build-metadata-${target.target}.json`;
  fs.writeFileSync(path.join(output, metadataName), JSON.stringify(metadata, null, 2) + '\n');
  checksums.push(`${await hashFile(path.join(output, metadataName))}  ${metadataName}`);
  fs.writeFileSync(path.join(output, `SHA256SUMS-${target.target}.txt`), checksums.join('\n') + '\n');
  console.log(`[ci-artifacts] Collected ${files.length} package file(s) with metadata and SHA-256 for ${target.target}.`);
}

main().catch(error => { console.error('[ci-artifacts]', error); process.exitCode = 1; });
