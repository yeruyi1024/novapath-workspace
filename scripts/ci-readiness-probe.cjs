'use strict';

const http = require('node:http');

// A socket's inactivity timeout is reset by each byte. Use an absolute deadline
// as well so an aborted or endlessly streaming response cannot hang the smoke.
function probe(port, probePath, { timeoutMs = 1500, maxBytes = 65536 } = {}) {
  return new Promise(resolve => {
    let request;
    let response;
    let settled = false;
    const failure = { status: 0, payload: null };
    const finish = (result, abort = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (abort) {
        response?.destroy();
        request?.destroy();
      }
      resolve(result);
    };
    const deadline = setTimeout(() => finish(failure, true), timeoutMs);
    try {
      request = http.get({ host: '127.0.0.1', port, path: probePath, timeout: timeoutMs }, incoming => {
        response = incoming;
        const chunks = [];
        let bytes = 0;
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxBytes) return finish(failure, true);
          chunks.push(chunk);
        });
        response.once('error', () => finish(failure, true));
        response.once('aborted', () => finish(failure, true));
        response.once('close', () => {
          if (!response.complete) finish(failure, true);
        });
        response.once('end', () => {
          let payload = null;
          try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* Not ready. */ }
          finish({ status: response.statusCode, payload });
        });
      });
      request.once('error', () => finish(failure, true));
      request.once('timeout', () => finish(failure, true));
    } catch {
      finish(failure, true);
    }
  });
}

async function started(port, options) {
  const startup = await probe(port, '/startupz', options);
  if (startup.status !== 404) {
    return startup.status >= 200 && startup.status < 300
      && startup.payload?.ok === true && startup.payload?.status === 'started';
  }
  const legacy = await probe(port, '/ready', options);
  return legacy.status >= 200 && legacy.status < 300 && legacy.payload?.ready === true;
}

module.exports = { probe, started };
