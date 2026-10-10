'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { PassThrough } = require('node:stream');
const { test } = require('node:test');
const { commandForPhase, exitWithResult, resolvePinnedNpmCli, runStep } = require('../ci-build-step.cjs');

function collector() {
  const stream = new PassThrough();
  let output = '';
  stream.on('data', chunk => { output += chunk.toString(); });
  return { stream, text: () => output };
}

function living(pid) {
  try {
    process.kill(pid, 0);
    // Linux can briefly retain a killed orphan as a zombie. It cannot run.
    if (process.platform === 'linux') {
      try {
        if (/\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, 'utf8'))) return false;
      } catch { return false; }
    }
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

if (process.argv[2] === '--cancel-fixture') {
  const grandchildSource = 'process.on("SIGTERM",()=>{});process.on("SIGINT",()=>{});setInterval(()=>{},1000)';
  const source = 'const {spawn}=require("node:child_process");'
    + `const grand=spawn(process.execPath,["-e",${JSON.stringify(grandchildSource)}],{stdio:"ignore"});`
    + 'process.on("SIGTERM",()=>{});process.on("SIGINT",()=>{});console.log("GRANDCHILD_PID="+grand.pid);setInterval(()=>{},1000);';
  runStep({ command: process.execPath, args: ['-e', source] }, { heartbeatMs: 50 })
    .then(exitWithResult).catch(error => { console.error(error); process.exitCode = 1; });
} else {
  test('silent child emits heartbeat while real stdout/stderr are forwarded', async () => {
    const stdout = collector();
    const stderr = collector();
    const result = await runStep({ command: process.execPath, args: ['-e',
      'console.log("child stdout");console.error("child stderr");setTimeout(()=>{},250);'] },
    { heartbeatMs: 30, stdout: stdout.stream, stderr: stderr.stream });
    assert.equal(result.code, 0);
    assert.equal(result.signal, null);
    assert.equal(result.cancelledSignal, undefined);
    assert.match(stdout.text(), /child stdout/);
    assert.match(stderr.text(), /child stderr/);
    assert.match(stderr.text(), /elapsed=\d+\.\ds secondsSinceLastOutput=\d+ pid=\d+ childExited=false/);
    assert.match(stderr.text(), /finished exit=0 signal=none cancellation=none/);
    assert.match(result.tail, /child stdout/);
    // Timer must stop after completion.
    const finishedLog = stderr.text();
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(stderr.text(), finishedLog);
  });

  test('real nonzero child failure preserves exit code and output', async () => {
    const stderr = collector();
    const result = await runStep({ command: process.execPath, args: ['-e',
      'console.error("intentional failure");process.exit(7);'] },
    { heartbeatMs: 30, stdout: collector().stream, stderr: stderr.stream });
    assert.equal(result.code, 7);
    assert.equal(result.cancelledSignal, undefined);
    assert.match(stderr.text(), /intentional failure/);
    assert.match(stderr.text(), /finished exit=7/);
  });

  test('real spawn error clearly reports ENOENT and never succeeds', async () => {
    const stderr = collector();
    const result = await runStep({ command: path.join(os.tmpdir(), `missing-ci-executable-${process.pid}`), args: [] },
      { heartbeatMs: 30, stdout: collector().stream, stderr: stderr.stream });
    assert.equal(result.spawnError.code, 'ENOENT');
    assert.notEqual(result.code, 0);
    assert.match(stderr.text(), /spawn error=ENOENT/);
  });

  for (const cancelSignal of ['SIGTERM', 'SIGINT']) {
  test(`actual ${cancelSignal} preserves wrapper cancellation and kills its descendant process group`,
    { skip: process.platform === 'win32', timeout: 12000 }, async () => {
      const child = spawn(process.execPath, [__filename, '--cancel-fixture'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let grandchild;
      child.stdout.on('data', chunk => { stdout += chunk.toString(); });
      child.stderr.on('data', chunk => { stderr += chunk.toString(); });
      const closed = once(child, 'close');
      try {
        const deadline = Date.now() + 3000;
        while (!/GRANDCHILD_PID=(\d+)/.test(stdout) && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        const match = /GRANDCHILD_PID=(\d+)/.exec(stdout);
        assert.ok(match, `fixture failed to start: ${stderr}`);
        grandchild = Number(match[1]);
        assert.ok(living(grandchild));
        child.kill(cancelSignal);
        const [code, signal] = await closed;
        assert.equal(code, null);
        assert.equal(signal, cancelSignal);
        assert.ok(stderr.includes(`cancellation=${cancelSignal}`));
        const stopDeadline = Date.now() + 3000;
        while (living(grandchild) && Date.now() < stopDeadline) {
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(living(grandchild), false, 'cancelled build left a running grandchild');
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        if (grandchild && living(grandchild)) process.kill(grandchild, 'SIGKILL');
      }
    });
  }

  test('npm resolver accepts only pinned CLI, follows npm symlink, rejects project npm 11.21', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-npm-resolver-'));
    try {
      const makeNpm = (name, version) => {
        const packageDirectory = path.join(directory, name, 'node_modules', 'npm');
        fs.mkdirSync(path.join(packageDirectory, 'bin'), { recursive: true });
        fs.writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({ name: 'npm', version }));
        const cli = path.join(packageDirectory, 'bin', 'npm-cli.js');
        fs.writeFileSync(cli, '// Resolver fixture only; never executed.\n');
        return cli;
      };
      const rejected = makeNpm('project', '11.21.0');
      const accepted = makeNpm('global', '11.17.0');
      assert.throws(() => resolvePinnedNpmCli({ npm_execpath: rejected, PATH: '' },
        path.join(directory, 'missing-node', 'node')), /Cannot locate.*11\.17\.0.*Rejected npm versions: 11\.21\.0/);
      assert.equal(resolvePinnedNpmCli({ npm_execpath: rejected, PATH: path.join(directory, 'global') },
        path.join(directory, 'missing-node', 'node')), fs.realpathSync(accepted));
      if (process.platform !== 'win32') {
        const bin = path.join(directory, 'symlink-bin');
        fs.mkdirSync(bin);
        fs.symlinkSync(accepted, path.join(bin, 'npm'));
        assert.equal(resolvePinnedNpmCli({ PATH: bin }, path.join(directory, 'missing-node', 'node')),
          fs.realpathSync(accepted));
      }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  test('production phase mapping rejects arbitrary phase/target and uses fixed Node installer', () => {
    assert.throws(() => commandForPhase('arbitrary', 'mac-arm64'), /Unsupported build phase\/target/);
    assert.throws(() => commandForPhase('runtime', 'mac-arm64;echo unsafe'), /Unsupported build phase\/target/);
    const installer = commandForPhase('installer', 'mac-arm64');
    assert.equal(installer.command, process.execPath);
    assert.deepEqual(installer.args, [path.resolve(__dirname, '..', 'ci-package.cjs')]);
    const invalid = spawnSync(process.execPath, [path.resolve(__dirname, '..', 'ci-build-step.cjs'), 'arbitrary'], {
      encoding: 'utf8', env: { ...process.env, CI_BUILD_TARGET: 'invalid' },
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Usage:.*runtime\|installer/);
    const wrongHost = spawnSync(process.execPath, [path.resolve(__dirname, '..', 'ci-build-step.cjs'), 'installer'], {
      encoding: 'utf8', env: { ...process.env, CI_BUILD_TARGET: process.platform === 'win32' ? 'mac-arm64' : 'win-x64' },
    });
    assert.equal(wrongHost.status, 1);
    assert.match(wrongHost.stderr, /requires.*host is/);
  });
}
