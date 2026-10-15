'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const tar = require('tar');
const manifest = require('../src/shared/asr/local-runtime.json');

const root = path.join(__dirname, '..');
const cache = path.join(root, '.work', 'local-asr');
const base = path.join(root, 'resources', 'asr-runtime');
const platform = { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform];
const hostTarget = `${platform}-${process.arch}`;
const preparing = new Map();
let sourcePreparation;

async function checksum(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function download(url, file, sha256) {
  if (fs.existsSync(file) && await checksum(file) === sha256) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.partial`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) });
    if (!response.ok || !response.body) throw new Error(`ASR download failed: HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary));
    if (await checksum(temporary) !== sha256) throw new Error('ASR download checksum mismatch');
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function run(executable, args) {
  const result = spawnSync(executable, args, { stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) {
    throw new Error(`Local ASR build failed: ${executable}. Install CMake and a native C++ toolchain. ${result.error?.message || ''}`);
  }
}

async function verifyPreparedRuntime(directory, target, { includeModel = true } = {}) {
  try {
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const executable = path.join(directory, target.startsWith('win-') ? 'whisper-cli.exe' : 'whisper-cli');
    return metadata.target === target && metadata.engineVersion === manifest.engineVersion
      && metadata.modelSha256 === manifest.model.sha256
      && /^[a-f0-9]{64}$/.test(metadata.executableSha256)
      && (!includeModel || (fs.statSync(path.join(directory, 'model.bin')).size === manifest.model.bytes
        && await checksum(path.join(directory, 'model.bin')) === manifest.model.sha256))
      && await checksum(executable) === metadata.executableSha256
      && ['whisper.cpp-LICENSE.txt', 'Whisper-model-LICENSE.txt', 'miniaudio-LICENSE.txt'].every(file =>
        fs.existsSync(path.join(directory, 'licenses', file)));
  } catch { return false; }
}

async function prepareSource() {
  const archive = path.join(cache, `whisper-${manifest.engineVersion}.tar.gz`);
  await download(manifest.sourceUrl, archive, manifest.sourceSha256);
  // Extract the verified archive into a fresh directory, never trust a stale checkout.
  const source = fs.mkdtempSync(path.join(cache, 'source-'));
  await tar.x({ file: archive, cwd: source, strip: 1 });
  return source;
}

async function prepare(target, { includeModel }) {
  if (!manifest.targets.includes(target)) throw new Error(`Unsupported ASR target: ${target}`);
  const output = path.join(base, target);
  if (await verifyPreparedRuntime(output, target, { includeModel })) return output;
  const [targetPlatform, targetArch] = target.split('-');
  // Cross-architecture macOS builds use Apple's universal SDK. Other systems
  // must build natively or supply an already verified target payload.
  if (targetPlatform !== platform || (targetArch !== process.arch && platform !== 'mac')) {
    throw new Error(`Prepare ${target} on its native build host before packaging; do not ship ${hostTarget} binaries for it.`);
  }
  fs.mkdirSync(base, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  sourcePreparation ??= prepareSource();
  const source = await sourcePreparation;
  const model = path.join(cache, 'ggml-small-q5_1.bin');
  console.log(`[local-asr] Preparing ${target}; ${includeModel ? 'model for local development' : 'engine only, model downloaded on first use'}`);
  if (includeModel) await download(manifest.model.url, model, manifest.model.sha256);
  const build = path.join(cache, `build-${target}`);
  fs.rmSync(build, { recursive: true, force: true });
  const cmake = process.env.STARPATH_CMAKE || 'cmake';
  const flags = [
    '-DCMAKE_BUILD_TYPE=Release', '-DBUILD_SHARED_LIBS=OFF', '-DGGML_NATIVE=OFF',
    '-DWHISPER_BUILD_TESTS=OFF', '-DWHISPER_BUILD_SERVER=OFF', '-DWHISPER_CURL=OFF',
    '-DGGML_OPENMP=OFF', '-DGGML_BLAS=OFF', '-DGGML_METAL=' + (platform === 'mac' ? 'ON' : 'OFF'),
    '-DGGML_METAL_EMBED_LIBRARY=ON', '-DGGML_AVX=OFF', '-DGGML_AVX2=OFF',
    '-DGGML_FMA=OFF', '-DGGML_F16C=OFF', '-DGGML_BMI2=OFF',
  ];
  if (platform === 'mac') flags.push(`-DCMAKE_OSX_ARCHITECTURES=${targetArch === 'x64' ? 'x86_64' : 'arm64'}`, '-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0');
  if (platform === 'win') flags.push('-A', targetArch === 'arm64' ? 'ARM64' : 'x64', '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded');
  run(cmake, ['-S', source, '-B', build, ...flags]);
  run(cmake, ['--build', build, '--config', 'Release', '--target', 'whisper-cli', '--parallel', '4']);
  const executableName = platform === 'win' ? 'whisper-cli.exe' : 'whisper-cli';
  const built = [path.join(build, 'bin', executableName), path.join(build, 'bin', 'Release', executableName)].find(fs.existsSync);
  if (!built) throw new Error('ASR executable missing after build');
  const staging = fs.mkdtempSync(path.join(base, `${target}-staging-`));
  try {
    fs.copyFileSync(built, path.join(staging, executableName));
    if (platform !== 'win') fs.chmodSync(path.join(staging, executableName), 0o755);
    if (includeModel) fs.copyFileSync(model, path.join(staging, 'model.bin'));
    const licenses = path.join(staging, 'licenses');
    fs.mkdirSync(licenses);
    fs.copyFileSync(path.join(source, 'LICENSE'), path.join(licenses, 'whisper.cpp-LICENSE.txt'));
    fs.copyFileSync(path.join(root, 'resources', 'asr-licenses', 'Whisper-model-LICENSE.txt'), path.join(licenses, 'Whisper-model-LICENSE.txt'));
    const audioHeader = fs.readFileSync(path.join(source, 'examples', 'miniaudio.h'), 'utf8');
    const licenseStart = audioHeader.lastIndexOf('This software is available as a choice of the following licenses.');
    if (licenseStart < 0) throw new Error('miniaudio license missing');
    fs.writeFileSync(path.join(licenses, 'miniaudio-LICENSE.txt'), audioHeader.slice(licenseStart).replace(/\*\/\s*$/, ''));
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({
      target, engineVersion: manifest.engineVersion, model: manifest.model.id,
      modelSha256: manifest.model.sha256, executableSha256: await checksum(built),
      sourceUrl: manifest.sourceUrl, sourceSha256: manifest.sourceSha256,
    }, null, 2) + '\n');
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(staging, output);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  if (!await verifyPreparedRuntime(output, target, { includeModel })) throw new Error('Prepared local ASR payload did not pass verification');
  console.log(`[local-asr] Ready: ${target}`);
  return output;
}

function ensureLocalAsrRuntime(target = hostTarget, { includeModel = true } = {}) {
  const key = `${target}:${includeModel}`;
  if (!preparing.has(key)) preparing.set(key, prepare(target, { includeModel }).finally(() => preparing.delete(key)));
  return preparing.get(key);
}

module.exports = { ensureLocalAsrRuntime, verifyPreparedRuntime, hostTarget };
if (require.main === module) {
  ensureLocalAsrRuntime(process.argv.slice(2).find(arg => !arg.startsWith('--')) || hostTarget,
    { includeModel: !process.argv.includes('--engine-only') }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
