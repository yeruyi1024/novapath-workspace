'use strict';

// Independent of the developer's Python installation. All payloads come from
// the pinned Astral CPython release and PyPI; native archives are hash-checked.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const tar = require('tar');
const manifest = require('./document-runtime.json');

const root = path.resolve(__dirname, '..');
const requirementsPath = path.join(__dirname, 'document-requirements.txt');
const base = path.join(root, 'resources', 'document-runtime');
const platformId = platform => ({ darwin: 'mac', win32: 'win', linux: 'linux' })[platform];
const hostTarget = `${platformId(process.platform)}-${process.arch}`;
const requirementsDigest = () => crypto.createHash('sha256').update(fs.readFileSync(requirementsPath)).digest('hex');
const pythonRelativePath = target => target.startsWith('win-') ? 'python.exe' : 'bin/python3';
const siteRelativePath = target => target.startsWith('win-') ? 'Lib/site-packages' : 'lib/python3.12/site-packages';

function runPython(executable, args) {
  const result = spawnSync(executable, args, { stdio: 'inherit', windowsHide: true,
    env: { ...process.env, PYTHONHOME: '', PYTHONPATH: '', PYTHONNOUSERSITE: '1', PIP_CONFIG_FILE: os.devNull },
  });
  if (result.error || result.status !== 0) throw new Error(`Bundled Python command failed (${result.status ?? result.error?.code}).`);
}

function verifyPreparedRuntime(runtimeRoot, target) {
  const metadataPath = path.join(runtimeRoot, 'starpath-runtime.json');
  if (!fs.existsSync(metadataPath) || !fs.existsSync(path.join(runtimeRoot, pythonRelativePath(target)))) return false;
  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    if (metadata.target !== target || metadata.pythonVersion !== manifest.pythonVersion
      || metadata.release !== manifest.release || metadata.archiveSha256 !== manifest.targets[target]?.sha256
      || metadata.requirementsSha256 !== requirementsDigest()) return false;
    return ['pptx', 'docx', 'openpyxl', 'pypdf', 'reportlab', 'PIL', 'lxml', 'defusedxml']
      .every(name => fs.existsSync(path.join(runtimeRoot, siteRelativePath(target), name)));
  } catch { return false; }
}

async function extractPython(target, destination) {
  const config = manifest.targets[target];
  if (!config) throw new Error(`Unsupported document runtime target: ${target}`);
  const name = `cpython-${manifest.pythonVersion}+${manifest.release}-${config.triple}-install_only_stripped.tar.gz`;
  const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${manifest.release}/${encodeURIComponent(name)}`;
  fs.mkdirSync(base, { recursive: true });
  const cachePath = path.join(base, name);
  if (!fs.existsSync(cachePath)) {
    console.log(`[document-runtime] Downloading CPython for ${target}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`CPython download failed: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (crypto.createHash('sha256').update(buffer).digest('hex') !== config.sha256) throw new Error('CPython archive checksum mismatch.');
    fs.writeFileSync(cachePath, buffer);
  }
  if (crypto.createHash('sha256').update(fs.readFileSync(cachePath)).digest('hex') !== config.sha256) {
    throw new Error('Cached CPython archive checksum mismatch. Remove the corrupt archive and retry.');
  }
  fs.mkdirSync(destination, { recursive: true });
  await tar.x({ file: cachePath, cwd: destination, strip: 1 });
  return url;
}

async function ensureDocumentRuntime(target = hostTarget) {
  if (!manifest.targets[target]) throw new Error(`Unsupported document runtime target: ${target}`);
  fs.mkdirSync(base, { recursive: true });
  const output = path.join(base, target);
  if (verifyPreparedRuntime(output, target)) {
    if (target === hostTarget) {
      runPython(path.join(output, pythonRelativePath(target)), ['-I', '-c', 'import pptx, docx, openpyxl, pypdf, reportlab, PIL, lxml, defusedxml']);
      runPython(path.join(output, pythonRelativePath(target)), ['-I', path.join(__dirname, 'verify-document-runtime.py')]);
    }
    console.log(`[document-runtime] Ready: ${target}`);
    return output;
  }
  const staging = fs.mkdtempSync(path.join(base, `${target}-staging-`));
  try {
    const sourceUrl = await extractPython(target, staging);
    let installer = path.join(staging, pythonRelativePath(target));
    if (target !== hostTarget) {
      const hostRoot = await ensureDocumentRuntime(hostTarget);
      installer = path.join(hostRoot, pythonRelativePath(hostTarget));
    }
    const site = path.join(staging, siteRelativePath(target));
    const targetOptions = target === hostTarget ? [] : ['--platform', manifest.targets[target].wheelPlatform,
      '--python-version', '3.12', '--implementation', 'cp', '--abi', 'cp312'];
    runPython(installer, ['-I', '-m', 'pip', '--isolated', 'install', '--index-url', 'https://pypi.org/simple',
      '--only-binary=:all:', '--no-deps', '--upgrade', '--target', site,
      ...targetOptions, '-r', requirementsPath]);
    if (target === hostTarget) {
      runPython(installer, ['-I', '-m', 'pip', 'check']);
      runPython(installer, ['-I', '-c', 'import pptx, docx, openpyxl, pypdf, reportlab, PIL, lxml, defusedxml']);
      runPython(installer, ['-I', path.join(__dirname, 'verify-document-runtime.py')]);
    }
    fs.writeFileSync(path.join(staging, 'starpath-runtime.json'), JSON.stringify({ target,
      pythonVersion: manifest.pythonVersion, release: manifest.release, sourceUrl,
      archiveSha256: manifest.targets[target].sha256, requirementsSha256: requirementsDigest(),
      nativeVerified: target === hostTarget,
    }, null, 2) + '\n');
    fs.copyFileSync(requirementsPath, path.join(staging, 'starpath-requirements.txt'));
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(staging, output);
    console.log(`[document-runtime] Prepared ${target}; native verification: ${target === hostTarget}`);
    return output;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

if (require.main === module) {
  const target = process.argv.find(value => value.startsWith('--target='))?.slice('--target='.length) || hostTarget;
  fs.mkdirSync(base, { recursive: true });
  ensureDocumentRuntime(target).catch(error => { console.error('[document-runtime]', error.message); process.exitCode = 1; });
}
module.exports = { ensureDocumentRuntime, verifyPreparedRuntime, pythonRelativePath, siteRelativePath, hostTarget };
