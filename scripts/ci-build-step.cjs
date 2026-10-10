'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { rootDir, targetFromEnv } = require('./ci-common.cjs');

const HEARTBEAT_MS = 30000;
const REQUIRED_NPM_VERSION = '11.17.0';
const PHASE = { RUNTIME: 'runtime', INSTALLER: 'installer' };
const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGBREAK: 131 };
const RUNTIME_SCRIPT = {
  'mac-arm64': 'openclaw:runtime:mac-arm64',
  'mac-x64': 'openclaw:runtime:mac-x64',
  'win-x64': 'openclaw:runtime:win-x64',
  'linux-x64': 'openclaw:runtime:linux-x64',
};

// npm installed as an application dependency is a different toolchain from
// the pinned global npm. Never silently execute that dependency's npm CLI.
function resolvePinnedNpmCli(env = process.env, executable = process.execPath) {
  const candidates = new Set();
  const add = filename => {
    if (filename) candidates.add(path.resolve(filename));
  };
  const addDirectory = directory => {
    if (!directory) return;
    add(path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    add(path.join(directory, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    for (const name of ['npm', 'npm.cmd']) {
      try { add(fs.realpathSync(path.join(directory, name))); } catch { /* Not installed here. */ }
    }
  };
  add(env.npm_execpath);
  addDirectory(path.dirname(executable));
  const environmentPaths = Object.entries(env).filter(([key]) => key.toUpperCase() === 'PATH');
  for (const [, value] of environmentPaths) {
    for (const directory of String(value || '').split(path.delimiter)) addDirectory(directory);
  }
  const rejected = new Set();
  for (const candidate of candidates) {
    try {
      const cli = fs.realpathSync(candidate);
      if (path.basename(cli) !== 'npm-cli.js' || !fs.statSync(cli).isFile()) continue;
      const npmPackage = JSON.parse(fs.readFileSync(path.join(path.dirname(cli), '..', 'package.json'), 'utf8'));
      if (npmPackage.name === 'npm' && npmPackage.version === REQUIRED_NPM_VERSION) return cli;
      rejected.add(npmPackage.version || '(unknown)');
    } catch { /* Continue to other known installation locations. */ }
  }
  throw new Error(`Cannot locate the pinned npm ${REQUIRED_NPM_VERSION} npm-cli.js. `
    + `Install npm@${REQUIRED_NPM_VERSION} globally and put its directory on PATH. `
    + `Rejected npm versions: ${[...rejected].join(', ') || 'none found'}.`);
}

function commandForPhase(phase, target, env = process.env) {
  if (phase === PHASE.RUNTIME && RUNTIME_SCRIPT[target]) {
    return { command: process.execPath, args: [resolvePinnedNpmCli(env), 'run', RUNTIME_SCRIPT[target]] };
  }
  if (phase === PHASE.INSTALLER && RUNTIME_SCRIPT[target]) {
    return { command: process.execPath, args: [path.join(rootDir, 'scripts', 'ci-package.cjs')] };
  }
  throw new Error(`Unsupported build phase/target: ${phase}/${target}. Expected runtime or installer on a configured native target.`);
}

function groupExists(pid) {
  try { process.kill(-pid, 0); return true; } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function terminateTree(child, signal, diagnostic) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    // Windows kill('SIGTERM') terminates only the parent abruptly. Invoke
    // taskkill /T before that parent disappears so descendants are included.
    await new Promise(resolve => {
      let done = false;
      let timer;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore', windowsHide: true, shell: false,
      });
      killer.once('error', error => {
        diagnostic(`tree cleanup failed: taskkill ${error.code || error.message}`);
        finish();
      });
      killer.once('close', code => {
        if (code !== 0 && child.exitCode === null && child.signalCode === null) {
          diagnostic(`tree cleanup failed: taskkill exit=${code}`);
        }
        finish();
      });
      timer = setTimeout(() => {
        diagnostic('tree cleanup exceeded 5s; runner cancellation remains the final fallback');
        killer.kill();
        finish();
      }, 5000);
    });
    return;
  }
  try { process.kill(-child.pid, signal); } catch (error) {
    if (error.code !== 'ESRCH') diagnostic(`tree cleanup failed: ${error.code || error.message}`);
  }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try { if (!groupExists(child.pid)) return; } catch (error) {
      diagnostic(`tree liveness check failed: ${error.code || error.message}`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
    if (error.code !== 'ESRCH') diagnostic(`tree cleanup failed: ${error.code || error.message}`);
  }
}

// The injectable timing/output options are for imported fixture tests only.
// The CLI has no arbitrary-command, timing, timeout, or retry input.
async function runStep(spec, options = {}) {
  const phase = options.phase || 'fixture';
  const target = options.target || '(fixture)';
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  if (!Number.isSafeInteger(heartbeatMs) || heartbeatMs <= 0) throw new Error('Invalid heartbeat interval.');
  const started = Date.now();
  let lastOutput = started;
  let tail = '';
  let child;
  let heartbeat;
  let cancelledSignal;
  let termination;
  let spawnError;
  let resolveCancelled;
  let closeOutcome;
  const cancelled = new Promise(resolve => { resolveCancelled = resolve; });
  const diagnostic = message => stderr.write(`[ci-build-step] phase=${phase} target=${target} ${message}\n`);
  const elapsed = () => ((Date.now() - started) / 1000).toFixed(1);
  const onSignal = signal => {
    if (cancelledSignal) return;
    cancelledSignal = signal;
    diagnostic(`cancellation=${signal} elapsed=${elapsed()}s pid=${child?.pid || 'none'}`);
    termination = terminateTree(child, signal, diagnostic).catch(error => {
      diagnostic(`tree cleanup failed: ${error.code || error.message}`);
    }).then(async () => {
      const deadline = Date.now() + 2000;
      while (!closeOutcome && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (!closeOutcome) diagnostic('child stdio did not close after cancellation; preserving cancellation status');
      resolveCancelled(closeOutcome || { code: child?.exitCode ?? null, signal: child?.signalCode ?? null });
    });
  };
  const signalHandlers = new Map(['SIGINT', 'SIGTERM', ...(process.platform === 'win32' ? ['SIGBREAK'] : [])]
    .map(signal => [signal, () => onSignal(signal)]));
  for (const [signal, handler] of signalHandlers) process.on(signal, handler);
  diagnostic('started (heartbeat reports process liveness, not completed work)');
  try {
    child = spawn(spec.command, spec.args, {
      cwd: options.cwd || rootDir,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
      shell: false,
    });
    const capture = chunk => {
      lastOutput = Date.now();
      tail = (tail + chunk.toString()).slice(-64000);
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    child.stdout.pipe(stdout, { end: false });
    child.stderr.pipe(stderr, { end: false });
    heartbeat = setInterval(() => {
      diagnostic(`elapsed=${elapsed()}s secondsSinceLastOutput=${Math.floor((Date.now() - lastOutput) / 1000)} `
        + `pid=${child.pid || 'none'} childExited=${child.exitCode !== null || child.signalCode !== null}`);
    }, heartbeatMs);
    const closed = new Promise(resolve => {
      child.once('error', error => {
        spawnError = error;
        diagnostic(`spawn error=${error.code || 'unknown'} message=${error.message}`);
      });
      child.once('exit', (code, signal) => {
        diagnostic(`child exited exit=${code} signal=${signal || 'none'} elapsed=${elapsed()}s`);
      });
      child.once('close', (code, signal) => {
        closeOutcome = { code, signal };
        resolve(closeOutcome);
      });
    });
    const outcome = await Promise.race([closed, cancelled]);
    if (termination) await termination;
    const result = { ...outcome, cancelledSignal, spawnError, elapsedMs: Date.now() - started, tail };
    const windowsCode = typeof result.code === 'number' && result.code > 255
      ? ` windowsExit=0x${(result.code >>> 0).toString(16).toUpperCase()}` : '';
    diagnostic(`finished exit=${result.code} signal=${result.signal || 'none'} cancellation=${cancelledSignal || 'none'} `
      + `elapsed=${elapsed()}s${windowsCode}`);
    return result;
  } finally {
    clearInterval(heartbeat);
    for (const [signal, handler] of signalHandlers) process.removeListener(signal, handler);
  }
}

function exitWithResult(result) {
  const signal = result.cancelledSignal || result.signal;
  if (signal && process.platform !== 'win32') {
    // Re-raise the signal after cleanup; cancellation must never become exit 0.
    process.kill(process.pid, signal);
    process.exit(SIGNAL_EXIT[signal] || 1);
  }
  if (signal) process.exit(SIGNAL_EXIT[signal] || 1);
  process.exit(result.spawnError ? 1 : (typeof result.code === 'number' ? result.code : 1));
}

async function main() {
  if (process.argv.length !== 3 || ![PHASE.RUNTIME, PHASE.INSTALLER].includes(process.argv[2])) {
    throw new Error('Usage: node scripts/ci-build-step.cjs runtime|installer (CI_BUILD_TARGET must select a native configured target).');
  }
  const phase = process.argv[2];
  const target = targetFromEnv(true);
  const spec = commandForPhase(phase, target.target);
  if (phase === PHASE.RUNTIME) console.log(`[ci-build-step] npm ${REQUIRED_NPM_VERSION} CLI=${spec.args[0]}`);
  exitWithResult(await runStep(spec, { phase, target: target.target }));
}

module.exports = { commandForPhase, exitWithResult, resolvePinnedNpmCli, runStep };
if (require.main === module) {
  main().catch(error => {
    console.error('[ci-build-step]', error?.stack || String(error));
    process.exitCode = 1;
  });
}
