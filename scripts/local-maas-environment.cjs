'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const environment = require('../src/shared/auth/localMaasEnvironment.json');

function readLocalMaasEnvironment() {
  const maasRoot = process.env.NOVAPATH_LOCAL_MAAS_DIR
    || path.join(os.homedir(), '.codex', 'worktrees', environment.worktreeName, 'maas-token');
  const envPath = path.join(maasRoot, '.env');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Z_][A-Z_0-9]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    env[match[1]] = value;
  }
  const dsn = env.SQL_DSN?.match(/^([A-Za-z0-9_]+):(.*?)@tcp\(127\.0\.0\.1:3306\)\/([A-Za-z0-9_]+)(?:\?.*)?$/);
  const origin = new URL(environment.origin);
  if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:' || !dsn || dsn[3] !== environment.database
    || env.PORT !== origin.port || env.LOG_SQL_DSN || /[\r\n]/.test(dsn[2])) {
    throw new Error('Local MaaS environment mismatch. Use the selected PC image database and API; no fallback is allowed.');
  }
  const identity = crypto.createHash('sha256').update(environment.origin + '|' + environment.database).digest('hex').slice(0, 16);
  const artifactDirectory = kind => path.resolve(__dirname, '..', '.local-tests', kind, identity);
  return { ...environment, env, envPath, maasRoot, databaseUser: dsn[1], databasePassword: dsn[2], identity, artifactDirectory };
}

module.exports = { environment, readLocalMaasEnvironment };
