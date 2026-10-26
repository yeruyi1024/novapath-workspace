'use strict';

// Local integration tooling only. Credentials stay in memory and never enter reports or argv.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { environment, readLocalMaasEnvironment } = require('./local-maas-environment.cjs');

const LOCAL_MAAS_ORIGIN = environment.origin;
const LOCAL_DATABASE = environment.database;

function readLocalMaasConnection() {
  const local = readLocalMaasEnvironment();
  const query = "SET SESSION TRANSACTION READ ONLY; START TRANSACTION; "
    + "SELECT JSON_OBJECT('tokenId',t.id,'tokenName',t.name,'owner',u.username,'apiKey',t.`key`) "
    + "FROM tokens t JOIN users u ON u.id=t.user_id "
    + "WHERE u.username='admin' AND u.status=1 AND u.deleted_at IS NULL AND t.deleted_at IS NULL "
    + "AND t.status=1 AND (t.expired_time=-1 OR t.expired_time>UNIX_TIMESTAMP()) "
    + "AND (t.unlimited_quota=1 OR t.remain_quota>0) ORDER BY t.id LIMIT 1; ROLLBACK;";
  // Send the password on stdin, not in command arguments or docker's environment flags.
  const sql = spawnSync('docker', ['exec', '-i', local.mysqlContainer, 'sh', '-c',
    'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql --batch --raw --skip-column-names --default-character-set=utf8mb4 --user=' + local.databaseUser + ' ' + LOCAL_DATABASE],
  { input: local.databasePassword + '\n' + query, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  if (sql.status !== 0 || sql.error) throw new Error('Cannot read the existing local MaaS database. No startup, mutation, or fallback was attempted.');
  let record;
  try { record = JSON.parse(sql.stdout.trim()); } catch { throw new Error('No enabled model token owned by the local admin was found.'); }
  if (!record.apiKey || typeof record.apiKey !== 'string') throw new Error('The local model token is missing.');
  const apiKey = record.apiKey.startsWith('sk-') ? record.apiKey : 'sk-' + record.apiKey;
  return { origin: LOCAL_MAAS_ORIGIN, database: LOCAL_DATABASE, tokenId: record.tokenId, tokenName: record.tokenName,
    owner: record.owner, apiKey, envPath: local.envPath, identity: local.identity };
}

function requestLocalMaas(connection, pathname, body) {
  if (connection.origin !== LOCAL_MAAS_ORIGIN || !['/api/status', '/v1/models', '/v1/chat/completions'].includes(pathname)) {
    return Promise.reject(new Error('Only the fixed local MaaS test endpoints are allowed.'));
  }
  const payload = body ? JSON.stringify(body) : undefined;
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(pathname, LOCAL_MAAS_ORIGIN), {
      method: payload ? 'POST' : 'GET', timeout: 60000,
      headers: { Accept: 'application/json', ...(pathname.startsWith('/v1/') ? { Authorization: 'Bearer ' + connection.apiKey } : {}),
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}) },
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; if (text.length > 1024 * 1024) req.destroy(); });
      response.on('error', () => reject(new Error('Local MaaS response interrupted.')));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          let code = '';
          try {
            const value = JSON.parse(text).error?.code;
            if (typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value)) code = ' (' + value + ')';
          } catch { /* Never expose the raw error response. */ }
          return reject(new Error('Local MaaS returned HTTP ' + response.statusCode + code + '. Response body omitted.'));
        }
        try { resolve(JSON.parse(text)); } catch { reject(new Error('Local MaaS returned invalid JSON.')); }
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Local MaaS request timed out. The request was not retried.')); });
    req.on('error', () => reject(new Error('Local MaaS is unavailable. Online fallback is disabled.')));
    req.end(payload);
  });
}

async function run() {
  const args = process.argv.slice(2);
  const modelFlag = args.indexOf('--model');
  const requestedModel = modelFlag >= 0 ? args[modelFlag + 1] : undefined;
  const remaining = modelFlag >= 0 ? args.filter((_, index) => index !== modelFlag && index !== modelFlag + 1) : args;
  if ((modelFlag >= 0 && !requestedModel) || remaining.some(arg => arg !== '--chat')) throw new Error('Usage: npm run test:maas:local [-- --chat --model MODEL_ID]');
  const connection = readLocalMaasConnection();
  const status = await requestLocalMaas(connection, '/api/status');
  if (status.success !== true) throw new Error('Local MaaS status is not healthy.');
  const catalog = await requestLocalMaas(connection, '/v1/models');
  if (!Array.isArray(catalog.data) || !catalog.data.length) throw new Error('The local model catalog is empty.');
  const models = catalog.data.map(model => model.id).filter(id => typeof id === 'string');
  const report = { checkedAt: new Date().toISOString(), origin: connection.origin, database: connection.database,
    tokenId: connection.tokenId, tokenName: connection.tokenName, owner: connection.owner, models, chat: 'not_requested' };
  if (args.includes('--chat')) {
    const model = requestedModel || models.find(id => /gemma/i.test(id)) || models.find(id => /deepseek.*flash/i.test(id));
    if (!models.includes(model)) throw new Error('No recognized configured text model was found in the local catalog.');
    if (!model) throw new Error('No recognized configured text model was found. Choose a model explicitly in a separate test; no model was guessed.');
    try {
      const response = await requestLocalMaas(connection, '/v1/chat/completions', {
        model, messages: [{ role: 'user', content: 'Reply with LOCAL_MAAS_OK only.' }], max_tokens: 64, stream: false,
      });
      const content = response.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new Error('The local text model returned no answer.');
      report.chat = { model, hasAnswer: true, expectedReply: content.includes('LOCAL_MAAS_OK') };
    } catch (error) {
      report.chat = { model, hasAnswer: false, error: error instanceof Error && /^(Local MaaS|The local)/.test(error.message)
        ? error.message : 'Local text request failed. Raw error omitted.' };
      process.exitCode = 1;
    }
  }
  const output = path.join(readLocalMaasEnvironment().artifactDirectory('maas-local'), 'report.json');
  fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}

module.exports = { LOCAL_MAAS_ORIGIN, LOCAL_DATABASE, readLocalMaasConnection, requestLocalMaas };
if (require.main === module) run().catch(error => {
  // Only fixed local diagnostics above may be emitted; never dump DB, network or credential objects.
  console.error(error instanceof Error && /^(Local MaaS|Cannot read|No enabled|The local|Usage:|No recognized|Only the fixed)/.test(error.message)
    ? error.message : 'Local MaaS test setup failed. Credentials and raw errors were omitted.');
  process.exitCode = 1;
});
