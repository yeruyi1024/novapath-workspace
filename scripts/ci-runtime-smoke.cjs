'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { readJson, rootDir, run, targetFromEnv } = require('./ci-common.cjs');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function probe(port, probePath) {
  return new Promise(resolve => {
    const request = http.get({ host: '127.0.0.1', port, path: probePath, timeout: 1500 }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.once('end', () => {
        let payload = null;
        try { payload = JSON.parse(body); } catch { /* Malformed JSON is not ready. */ }
        resolve({ status: response.statusCode, payload });
      });
    });
    request.once('error', () => resolve({ status: 0, payload: null }));
    request.once('timeout', () => request.destroy());
  });
}

async function started(port) {
  const startup = await probe(port, '/startupz');
  if (startup.status !== 404) {
    return startup.status >= 200 && startup.status < 300
      && startup.payload?.ok === true && startup.payload?.status === 'started';
  }
  const legacy = await probe(port, '/ready');
  return legacy.status >= 200 && legacy.status < 300 && legacy.payload?.ready === true;
}

async function main() {
  const target = targetFromEnv(true);
  const runtime = fs.realpathSync(path.join(rootDir, 'vendor', 'openclaw-runtime', 'current'));
  const buildInfo = readJson(path.join(runtime, 'runtime-build-info.json'));
  const version = readJson(path.join(rootDir, 'package.json')).openclaw.version;
  if (buildInfo.target !== target.target || buildInfo.openclawVersion !== version || !buildInfo.openclawCommit) {
    throw new Error(`Runtime provenance does not match ${target.target}/${version}.`);
  }
  const electron = require('electron');
  if (typeof electron !== 'string' || !fs.existsSync(electron)) throw new Error('Electron binary is missing.');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lobsterai-ci-smoke-'));
  let child;
  let log = '';
  const token = randomBytes(32).toString('hex');
  const append = chunk => { log = (log + chunk.toString()).slice(-64000); };
  try {
    // Use Electron's Node ABI, matching the application's native database host.
    const probe = path.join(temp, 'sqlite.cjs');
    fs.writeFileSync(probe, `const Database = require(${JSON.stringify(path.join(rootDir, 'node_modules', 'better-sqlite3'))});\n`
      + 'const db = new Database(":memory:");\n'
      + 'if (db.prepare("SELECT 42 AS result").get().result !== 42) throw new Error("SQLite result mismatch");\n'
      + 'db.close(); console.log("[ci-smoke] Electron SQLite native query passed");\n');
    run(electron, [probe], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30000 });
    const state = path.join(temp, 'state');
    fs.mkdirSync(state);
    const config = path.join(state, 'openclaw.json');
    fs.writeFileSync(config, JSON.stringify({
      gateway: { mode: 'local', bind: 'loopback', auth: { mode: 'token', token } },
      plugins: { enabled: false },
    }));
    const port = await freePort();
    const entry = path.join(runtime, 'gateway-bundle.mjs');
    if (!fs.existsSync(entry)) throw new Error('The built gateway bundle is missing.');
    child = spawn(electron, [entry, 'gateway', '--port', String(port), '--token', token], {
      cwd: runtime,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        OPENCLAW_HOME: temp,
        OPENCLAW_STATE_DIR: state,
        OPENCLAW_CONFIG_PATH: config,
        OPENCLAW_NO_RESPAWN: '1',
        NO_PROXY: '127.0.0.1,localhost',
        no_proxy: '127.0.0.1,localhost',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    let spawnError;
    child.once('error', error => { spawnError = error; });
    const deadline = Date.now() + 120000;
    let ready = false;
    while (Date.now() < deadline && child.exitCode === null && child.signalCode === null && !spawnError) {
      if (await started(port)) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw spawnError || new Error(`OpenClaw gateway did not become startup-ready (exit=${child.exitCode}).`);
    console.log(`[ci-smoke] ${target.target} OpenClaw ${version} reached startup readiness under Electron (plugins disabled).`);
  } catch (error) {
    // Gateway logs can contain its ephemeral launch token. Never expose it.
    if (log) console.error(log.split(token).join('<redacted>'));
    throw error;
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit').catch(() => {});
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
      if (child.exitCode === null && child.signalCode === null) {
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } else child.kill('SIGKILL');
        await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
      }
    }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => { console.error('[ci-smoke]', error); process.exitCode = 1; });
