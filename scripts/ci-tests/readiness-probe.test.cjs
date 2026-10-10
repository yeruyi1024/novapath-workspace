'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { probe, started } = require('../ci-readiness-probe.cjs');

async function withServer(handler, body) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await body(server.address().port); }
  finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test('startup readiness requires successful HTTP and both exact JSON flags', async () => {
  for (const [status, payload, expected] of [
    [200, { ok: true, status: 'started' }, true],
    [503, { ok: true, status: 'started' }, false],
    [200, { ok: false, status: 'started' }, false],
    [200, { ok: true, status: 'starting' }, false],
  ]) {
    await withServer((_req, res) => { res.writeHead(status); res.end(JSON.stringify(payload)); },
      async port => assert.equal(await started(port), expected));
  }
});

test('only startupz HTTP 404 enables the legacy readiness path', async () => {
  for (const status of [404, 200, 403, 503]) {
    const paths = [];
    await withServer((req, res) => {
      paths.push(req.url);
      res.writeHead(req.url === '/startupz' ? status : 200);
      res.end(JSON.stringify({ ready: true }));
    }, async port => assert.equal(await started(port), status === 404));
    assert.deepEqual(paths, status === 404 ? ['/startupz', '/ready'] : ['/startupz']);
  }
});

test('malformed and oversized response bodies never become ready', async () => {
  for (const response of ['not-json', '{"ok":true,"status":"started","pad":"' + 'a'.repeat(2048) + '"}']) {
    await withServer((_req, res) => res.end(response), async port => {
      assert.equal(await started(port, { maxBytes: 256 }), false);
    });
  }
});

test('an aborted response resolves instead of hanging the outer startup loop', async () => {
  await withServer((_req, res) => {
    res.writeHead(200);
    res.write('{"ok":');
    setImmediate(() => res.destroy());
  }, async port => {
    assert.deepEqual(await probe(port, '/startupz', { timeoutMs: 200 }), { status: 0, payload: null });
  });
});

test('continuous bytes cannot extend the absolute request deadline', async () => {
  await withServer((_req, res) => {
    res.writeHead(200);
    res.write('{');
    const interval = setInterval(() => res.write(' '), 10);
    res.once('close', () => clearInterval(interval));
  }, async port => {
    const began = Date.now();
    assert.deepEqual(await probe(port, '/startupz', { timeoutMs: 100 }), { status: 0, payload: null });
    assert.ok(Date.now() - began < 1000, 'the drip response must not keep the probe pending');
  });
});

test('a silent server and connection refusal both return an unsuccessful probe', async () => {
  let closedPort;
  await withServer(() => {}, async port => {
    closedPort = port;
    assert.deepEqual(await probe(port, '/startupz', { timeoutMs: 100 }), { status: 0, payload: null });
  });
  assert.deepEqual(await probe(closedPort, '/startupz'), { status: 0, payload: null });
});
