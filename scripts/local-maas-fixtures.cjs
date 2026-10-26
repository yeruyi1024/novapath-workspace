'use strict';

// Local, explicitly authorized fixtures only. Never print passwords or auth responses.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { environment, readLocalMaasEnvironment } = require('./local-maas-environment.cjs');

const origin = environment.origin;
const batch = 'starpath-local-fixtures-20261020-v2';
const local = readLocalMaasEnvironment();
const directory = local.artifactDirectory('maas-local-fixtures');
const manifestPath = path.join(directory, 'manifest.json');
const prefix = '[星途联调] ';
// Authenticate the three wallet scenarios only; admin reads cover the other
// fixtures without spending the shared login/logout budget on every persona.
const selfChecks = new Set(['lowwallet', 'limited', 'repeat']);
const plans = [
  ['trial', '新客体验包', 0, 'day', 7, 5, 'never', 1],
  ['day', '轻量日包', 3, 'day', 1, 3, 'never', 0],
  ['week', '日常周包', 9, 'day', 7, 3, 'daily', 0],
  ['month', '标准月包', 29, 'month', 1, 50, 'never', 0],
  ['daily', '每日刷新月包', 29, 'month', 1, 5, 'daily', 0],
  ['weekly', '每周刷新月包', 49, 'month', 1, 20, 'weekly', 0],
  ['pro', '专业月包', 99, 'month', 1, 150, 'monthly', 0],
  ['year', '年度工作包', 299, 'year', 1, 500, 'monthly', 0],
  ['repeat', '可叠加补充包', 5, 'day', 7, 10, 'never', 0],
  ['limited', '限购一次特惠包', 1, 'day', 7, 2, 'never', 1],
  ['refresh', '15分钟刷新演示包', 2, 'custom', 1, 2, 'custom', 0],
  ['unlimited', '不限额月包', 199, 'month', 1, 0, 'never', 0],
  ['nooverflow', '额度耗尽即停止月包', 19, 'month', 1, 10, 'daily', 0],
  ['offline', '管理员发放演示包', 39, 'month', 1, 20, 'monthly', 0],
  ['archived', '历史下架包', 15, 'month', 1, 20, 'never', 0],
];
const personas = [
  ['new', '小星·首次购买', 100, []],
  ['active', '小林·正常使用', 100, [['month', 0.3]]],
  ['lowquota', '小周·额度将尽', 30, [['daily', 0.98]]],
  ['exhausted', '小吴·额度耗尽', 20, [['nooverflow', 1]]],
  ['lowwallet', '小陈·余额不足', 0.25, []],
  ['limited', '小许·限购已满', 50, [['limited', 0, 'purchase']]],
  ['multi', '小唐·多份套餐', 200, [['daily', 0.4], ['weekly', 0.2], ['pro', 0.7]]],
  ['expired', '小何·套餐已到期', 10, [['archived', 0.8, 'expired']]],
  ['cancelled', '小叶·套餐已作废', 10, [['month', 0.1, 'cancelled']]],
  ['refresh', '小赵·刷新倒计时', 30, [['refresh', 0.7, 'refresh']]],
  ['repeat', '小陆·重复购买', 50, [['repeat', 0.25, 'purchase'], ['repeat', 0, 'purchase']]],
  ['unlimited', '小顾·不限额套餐', 300, [['unlimited', 0]]],
  ['expiring', '小苏·一小时到期', 20, [['pro', 0.4, 'expiring']]],
];

function check(condition, label) {
  if (!condition) throw new Error('Fixture check failed: ' + label);
}

function passwordFor(username, env) {
  check(personas.some(p => username === 'xt_test_' + p[0]), 'known test username');
  return crypto.createHmac('sha256', env.LOCAL_DEV_ADMIN_PASSWORD)
    .update(batch + ':' + origin + ':' + environment.database + ':' + username).digest('base64url').slice(0, 20);
}

function save(file, value) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(file + '.tmp', file);
}

async function request(auth, method, endpoint, body, allowFailure = false) {
  const allowed = method === 'GET'
    ? /^\/api\/(status|user\/(\d+|self|topup\/info|search\?keyword=xt_test_[a-z]+&page_size=100|\?p=1&page_size=100)|subscription\/(admin\/plans|plans|self|admin\/users\/\d+\/subscriptions))$/
    : /^\/api\/(user\/(login|auth\/logout|manage|)|subscription\/(admin\/plans(?:\/\d+)?|admin\/users\/\d+\/subscriptions|admin\/user_subscriptions\/\d+\/invalidate|balance\/pay))$/;
  check(allowed.test(endpoint), 'allowed local route');
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const result = await new Promise((resolve, reject) => {
    const req = http.request(new URL(endpoint, origin), {
      method, timeout: 20000,
      headers: { Accept: 'application/json', Origin: origin,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(auth?.token ? { Authorization: 'Bearer ' + auth.token, 'X-Auth-Session': auth.sid } : {}),
        ...(auth?.cookie ? { Cookie: auth.cookie } : {}) },
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', part => { text += part; if (text.length > 2 * 1024 * 1024) req.destroy(); });
      response.on('error', () => reject(new Error('Local response interrupted')));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          resolve({ status: response.statusCode, body: {}, cookies: [] });
          return;
        }
        try { resolve({ status: response.statusCode, body: JSON.parse(text), cookies: response.headers['set-cookie'] || [] }); }
        catch { reject(new Error('Local response is not JSON')); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => reject(new Error('Local request failed; no retry or fallback')));
    req.end(payload);
  });
  if (!allowFailure) {
    check(result.status === 200, 'HTTP ' + result.status + ' ' + method + ' ' + endpoint);
    check(result.body.success === true, method + ' ' + endpoint + ' rejected');
  }
  return result;
}

async function login(username, password) {
  const { body, cookies } = await request(null, 'POST', '/api/user/login', { username, password });
  const data = body.data;
  check(data?.access_token && data.session?.sid && data.user?.id, 'login bundle');
  return { token: data.access_token, sid: data.session.sid, id: data.user.id,
    cookie: cookies.map(value => value.split(';')[0]).join('; ') };
}

function patchSubscription(env, owner, entry, changes) {
  check(/^xt_test_[a-z]+$/.test(owner.username) && entry.title.startsWith(prefix), 'fixture ownership');
  const permitted = ['amount_used', 'start_time', 'end_time', 'last_reset_time', 'next_reset_time', 'updated_at'];
  const assignments = Object.entries(changes).map(([key, value]) => {
    check(permitted.includes(key) && Number.isSafeInteger(value) && value >= 0, 'snapshot field');
    return 's.' + key + '=' + value;
  });
  check(env === local.env, 'selected environment credentials');
  const ids = [owner.id, entry.id, entry.planId];
  check(ids.every(id => Number.isSafeInteger(id) && id > 0), 'positive IDs');
  const predicate = 's.id=' + entry.id + ' AND s.user_id=' + owner.id + ' AND s.plan_id=' + entry.planId
    + " AND u.username='" + owner.username + "' AND BINARY p.title=0x" + Buffer.from(entry.title).toString('hex');
  const sql = 'START TRANSACTION; SELECT COUNT(*) FROM user_subscriptions s JOIN users u ON u.id=s.user_id '
    + 'JOIN subscription_plans p ON p.id=s.plan_id WHERE ' + predicate + ';'
    + ' UPDATE user_subscriptions s JOIN users u ON u.id=s.user_id '
    + 'JOIN subscription_plans p ON p.id=s.plan_id SET ' + assignments.join(',')
    + ' WHERE ' + predicate + ';'
    + ' SELECT ROW_COUNT(); COMMIT;';
  const result = spawnSync('docker', ['exec', '-i', local.mysqlContainer, 'sh', '-c',
    'IFS= read -r MYSQL_PWD; export MYSQL_PWD; exec mysql --batch --raw --skip-column-names --default-character-set=utf8mb4 --user=' + local.databaseUser + ' ' + local.database],
  { input: local.databasePassword + '\n' + sql, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  check(result.status === 0 && !result.error && /^\s*1\s+[01]\s*$/.test(result.stdout), 'scoped fixture snapshot update');
}

function originalUser(user) {
  // Other stages may consume the admin's models concurrently; compare identity, not live usage.
  return Object.fromEntries(['id', 'username', 'display_name', 'role', 'status', 'group'].map(k => [k, user[k]]));
}

function loadPurchaseAdapter() {
  const Module = require('node:module');
  const result = require('esbuild').buildSync({ stdin: { resolveDir: path.resolve(__dirname, '..'), loader: 'ts', contents:
    "export {createMaasSubscriptionPurchaser} from './src/main/libs/maasSubscriptionPurchase';"
    + "export {parseMaasPlans,parseMaasSubscriptionRecords} from './src/shared/auth/maasSubscriptions';"
    + "export {parseMaasBillingSnapshot} from './src/shared/auth/maasBilling';" },
  bundle: true, platform: 'node', format: 'cjs', write: false });
  const compiled = new Module(path.join(directory, 'purchase-adapter.cjs'), module);
  compiled.filename = path.join(directory, 'purchase-adapter.cjs');
  compiled._compile(result.outputFiles[0].text, compiled.filename);
  return compiled.exports;
}

function purchaserFor(auth, accountId, status, adapters) {
  let posts = 0;
  const purchaser = adapters.createMaasSubscriptionPurchaser({
    file: path.join(directory, 'purchase-journal-' + accountId + '.json'),
    context: async expectedAccount => {
      check(expectedAccount === accountId, 'purchase account binding');
      const user = (await request(auth, 'GET', '/api/user/self')).body.data;
      const planData = (await request(auth, 'GET', '/api/subscription/plans')).body.data;
      const subData = (await request(auth, 'GET', '/api/subscription/self')).body.data;
      const payment = (await request(auth, 'GET', '/api/user/topup/info')).body.data;
      const wallet = adapters.parseMaasBillingSnapshot(user, status, accountId);
      return { accountId, origin, sessionId: auth.sid, wallet, data: { accountId, origin, syncedAt: Date.now(),
        plans: adapters.parseMaasPlans(planData), ...adapters.parseMaasSubscriptionRecords(subData, accountId),
        wallet, paymentCompliance: payment.payment_compliance_confirmed } };
    },
    pay: async planId => { posts += 1; return request(auth, 'POST', '/api/subscription/balance/pay', { plan_id: planId }, true); },
  });
  return { purchaser, posts: () => posts };
}

async function checkNaturalReset(admin, manifest) {
  const user = manifest.users.refresh;
  const entry = user.subscriptions[0];
  const deadline = Date.now() + 95000;
  let current;
  do {
    current = (await request(admin, 'GET', '/api/subscription/admin/users/' + user.id + '/subscriptions')).body.data
      .map(s => s.subscription).find(s => s.id === entry.id);
    if (current?.last_reset_time >= entry.snapshot.next_reset_time && current.next_reset_time > entry.snapshot.next_reset_time) break;
    if (Date.now() >= deadline) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  } while (true);
  check(current?.amount_used === 0 && current.last_reset_time >= entry.snapshot.next_reset_time
    && current.next_reset_time > entry.snapshot.next_reset_time, 'natural quota reset not observed within local check window');
  check(current.end_time === entry.snapshot.end_time, 'reset preserves expiry');
  const report = { checkedAt: new Date().toISOString(), origin, database: local.database, account: user.username,
    subscriptionId: current.id, amountUsed: current.amount_used, lastResetTime: current.last_reset_time,
    nextResetTime: current.next_reset_time, expiryUnchanged: true, naturalReset: 'passed' };
  save(path.join(directory, 'refresh-check.json'), report);
  return report;
}

async function run() {
  const args = process.argv.slice(2);
  const copy = args[0] === '--copy-password' && args.length === 2;
  check(copy || (args.length === 1 && ['--prepare', '--apply', '--verify', '--check-refresh'].includes(args[0])), 'usage: --prepare, --apply, --verify, --check-refresh, or --copy-password USERNAME');
  const env = local.env;
  check(env.LOCAL_DEV_ADMIN_PASSWORD, 'local admin credential exists');
  if (copy) {
    check(process.platform === 'darwin', 'clipboard helper currently supports macOS');
    const result = spawnSync('pbcopy', [], { input: passwordFor(args[1], env), timeout: 10000 });
    check(result.status === 0 && !result.error, 'clipboard');
    console.log('Test password copied for ' + args[1] + '; clipboard contains a credential.');
    return;
  }
  const admin = await login(env.LOCAL_DEV_ADMIN_USERNAME || 'admin', env.LOCAL_DEV_ADMIN_PASSWORD);
  const sessions = [admin];
  const userSessions = new Map();
  try {
    if (args[0] === '--check-refresh') {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      check(manifest.origin === origin && manifest.database === local.database && manifest.complete, 'current fixture batch');
      console.log(JSON.stringify(await checkNaturalReset(admin, manifest), null, 2));
      return;
    }
    const status = (await request(admin, 'GET', '/api/status')).body.data;
    const payment = (await request(admin, 'GET', '/api/user/topup/info')).body.data;
    const paymentReady = payment.payment_compliance_confirmed === true;
    const unit = status.quota_per_unit;
    check(Number.isSafeInteger(unit) && unit > 0, 'quota unit');
    const initialPlans = (await request(admin, 'GET', '/api/subscription/admin/plans')).body.data.map(x => x.plan);
    const initialUsers = (await request(admin, 'GET', '/api/user/?p=1&page_size=100')).body.data;
    check(initialUsers.total <= 100, 'user inventory fits one page');
    let manifest;
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      check(manifest.batch === batch && manifest.origin === origin && manifest.database === local.database && manifest.unit === unit, 'matching manifest');
    } else {
      check(['--prepare', '--apply'].includes(args[0]), 'prepare or apply fixtures first');
      check(!initialPlans.some(p => p.title.startsWith(prefix)) && !initialUsers.items.some(u => u.username.startsWith('xt_test_')), 'no untracked fixture collision');
      manifest = { batch, origin, database: local.database, identity: local.identity, unit, createdAt: new Date().toISOString(),
        originalPlans: initialPlans, originalUsers: initialUsers.items.map(originalUser), plans: {}, users: {}, complete: false };
      save(manifestPath, manifest);
    }
    const preparing = args[0] === '--prepare';
    const applying = (args[0] === '--apply' || preparing) && !manifest.complete;
    const adapters = loadPurchaseAdapter();
    if (applying) {
      for (const [index, definition] of (paymentReady ? plans : []).entries()) {
        const [key, name, price, duration, value, quota, reset, limit] = definition;
        if (manifest.plans[key]) continue;
        check(!initialPlans.some(p => p.title === prefix + name), 'untracked plan; inspect manifest before retry');
        const plan = { title: prefix + name, subtitle: '仅本地开发测试，模拟权益与价格；不可作为正式销售配置。', price_amount: price, currency: 'USD',
          duration_unit: duration, duration_value: value, custom_seconds: duration === 'custom' ? 86400 : 0,
          enabled: true, sort_order: 1000 - index, total_amount: quota * unit, quota_reset_period: reset,
          quota_reset_custom_seconds: reset === 'custom' ? 900 : 0, max_purchase_per_user: limit,
          allow_balance_pay: key !== 'offline', allow_wallet_overflow: key !== 'nooverflow',
          upgrade_group: '', downgrade_group: '', stripe_price_id: '', creem_product_id: '', waffo_pancake_product_id: '' };
        const created = (await request(admin, 'POST', '/api/subscription/admin/plans', { plan })).body.data;
        check(created?.id && created.title === plan.title, 'created plan');
        manifest.plans[key] = created;
        save(manifestPath, manifest);
      }
      console.log('Local fixture plans prepared: ' + Object.keys(manifest.plans).length);
      for (const [key, name, wallet, subscriptions] of personas) {
        let user = manifest.users[key];
        if (!user) {
          const username = 'xt_test_' + key;
          check(!initialUsers.items.some(u => u.username === username), 'untracked user; inspect manifest before retry');
          await request(admin, 'POST', '/api/user/', { username, password: passwordFor(username, env), display_name: name, role: 1 });
          const found = (await request(admin, 'GET', '/api/user/search?keyword=' + username + '&page_size=100')).body.data.items.filter(u => u.username === username);
          check(found.length === 1, 'created test user');
          user = manifest.users[key] = { id: found[0].id, username, displayName: name, funded: false, subscriptions: [] };
          save(manifestPath, manifest);
        }
        const registeredUser = (await request(admin, 'GET', '/api/user/' + user.id)).body.data;
        check(registeredUser.username === 'xt_test_' + key && registeredUser.username === user.username
          && registeredUser.role === 1 && !manifest.originalUsers.some(u => u.id === user.id), 'registered fixture account');
        if (!user.funded) {
          await request(admin, 'POST', '/api/user/manage', { id: user.id, action: 'add_quota', mode: 'override', value: Math.round(wallet * unit) });
          user.initialWallet = Math.round(wallet * unit);
          user.funded = true;
          save(manifestPath, manifest);
        }
        if (!paymentReady) continue;
        let userAuth;
        let adapter;
        for (const [index, definition] of subscriptions.entries()) {
          const [planKey, fraction, scenario] = definition;
          if (preparing && scenario === 'purchase') continue;
          let entry = user.subscriptions[index];
          const plan = manifest.plans[planKey];
          if (!entry) {
            const before = (await request(admin, 'GET', '/api/subscription/admin/users/' + user.id + '/subscriptions')).body.data.map(s => s.subscription.id);
            check(before.every(id => user.subscriptions.some(s => s.id === id)), 'untracked subscription; inspect manifest before retry');
            if (scenario === 'purchase') {
              if (!userAuth) {
                userAuth = await login(user.username, passwordFor(user.username, env));
                sessions.push(userAuth);
                userSessions.set(user.username, userAuth);
              }
              if (!adapter) adapter = purchaserFor(userAuth, user.id, status, adapters);
              const prepared = await adapter.purchaser.prepare(user.id, plan.id);
              check(prepared.state === 'ready' && prepared.confirmation?.chargedQuota === Math.ceil(plan.price_amount * unit), 'client purchase confirmation');
              const beforePosts = adapter.posts();
              const purchased = await adapter.purchaser.purchase(user.id, prepared.confirmation.confirmationId);
              check(purchased.state === 'succeeded' && adapter.posts() === beforePosts + 1, 'client purchase submits exactly once');
              const replay = await adapter.purchaser.purchase(user.id, prepared.confirmation.confirmationId);
              check(replay.state === 'rejected' && replay.error === 'expired' && adapter.posts() === beforePosts + 1, 'confirmation replay sends no second purchase');
              user.clientPurchases = (user.clientPurchases || 0) + 1;
            } else await request(admin, 'POST', '/api/subscription/admin/users/' + user.id + '/subscriptions', { plan_id: plan.id });
            const added = (await request(admin, 'GET', '/api/subscription/admin/users/' + user.id + '/subscriptions')).body.data
              .map(s => s.subscription).filter(s => !before.includes(s.id) && s.plan_id === plan.id);
            check(added.length === 1, 'one new subscription');
            entry = user.subscriptions[index] = { id: added[0].id, planId: plan.id, title: plan.title, planKey, scenario: scenario || 'active', prepared: false };
            save(manifestPath, manifest);
          }
          if (!entry.prepared) {
            const now = Math.floor(Date.now() / 1000);
            const changes = { amount_used: planKey === 'unlimited' ? 34 * unit : Math.round(plan.total_amount * fraction), updated_at: now };
            if (scenario === 'expired') Object.assign(changes, { start_time: now - 31 * 86400, end_time: now - 86400, last_reset_time: 0, next_reset_time: 0 });
            if (scenario === 'expiring') Object.assign(changes, { start_time: now - 29 * 86400, end_time: now + 3600, last_reset_time: now - 29 * 86400, next_reset_time: 0 });
            if (scenario === 'refresh') Object.assign(changes, { start_time: now - 885, end_time: now + 85515, last_reset_time: now - 885, next_reset_time: now + 15 });
            patchSubscription(env, user, entry, changes);
            if (scenario === 'cancelled') await request(admin, 'POST', '/api/subscription/admin/user_subscriptions/' + entry.id + '/invalidate');
            entry.snapshot = changes;
            entry.prepared = true;
            save(manifestPath, manifest);
          }
        }
        console.log('Prepared ' + user.username + ': ' + user.subscriptions.length + ' subscriptions');
      }
      if (paymentReady) {
        const archived = manifest.plans.archived;
        await request(admin, 'PATCH', '/api/subscription/admin/plans/' + archived.id, { enabled: false });
        archived.enabled = false;
      }
      manifest.accountsReady = true;
      manifest.complete = paymentReady && !preparing;
      save(manifestPath, manifest);
    }

    if (!paymentReady) {
      const report = { checkedAt: new Date().toISOString(), origin, database: local.database, identity: local.identity,
        accounts: Object.values(manifest.users).map(u => ({ username: u.username, displayName: u.displayName, id: u.id, funded: u.funded, initialWallet: u.initialWallet })),
        accountsReady: manifest.accountsReady === true, plansReady: false, purchaseReady: false,
        pending: 'administrator_payment_compliance_confirmation', noComplianceBypass: true };
      save(path.join(directory, 'resource-status.json'), report);
      console.log(JSON.stringify({ origin, database: local.database, accountsReady: report.accountsReady, users: report.accounts.length,
        plansReady: false, purchaseReady: false, pending: report.pending }, null, 2));
      return;
    }

    if (preparing && !manifest.complete) {
      const report = { checkedAt: new Date().toISOString(), origin, database: local.database, identity: local.identity,
        accountsReady: true, plansReady: true, purchaseReady: false, paymentComplianceConfirmed: true,
        subscriptionCount: Object.values(manifest.users).reduce((count, user) => count + user.subscriptions.length, 0),
        pending: 'wallet_purchase_validation',
        accounts: Object.values(manifest.users).map(user => ({ username: user.username, displayName: user.displayName, id: user.id })) };
      save(path.join(directory, 'resource-status.json'), report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    check(manifest.complete, 'fixture batch complete');
    const currentPlans = (await request(admin, 'GET', '/api/subscription/admin/plans')).body.data.map(x => x.plan);
    const currentUsers = (await request(admin, 'GET', '/api/user/?p=1&page_size=100')).body.data.items;
    for (const before of manifest.originalPlans) check(JSON.stringify(currentPlans.find(p => p.id === before.id)) === JSON.stringify(before), 'original plan preserved ' + before.id);
    for (const before of manifest.originalUsers) check(JSON.stringify(originalUser(currentUsers.find(u => u.id === before.id) || {})) === JSON.stringify(before), 'original user preserved ' + before.id);
    for (const plan of Object.values(manifest.plans)) {
      const current = currentPlans.find(p => p.id === plan.id);
      for (const field of ['title', 'enabled', 'price_amount', 'total_amount', 'quota_reset_period', 'allow_balance_pay', 'max_purchase_per_user', 'allow_wallet_overflow']) {
        check(current?.[field] === plan[field], 'fixture plan ' + plan.id + ' ' + field);
      }
    }
    const report = { batch, origin, database: local.database, identity: local.identity, checkedAt: new Date().toISOString(), planCount: Object.keys(manifest.plans).length,
      originalRecordsPreserved: true, modelCalls: 'not_requested', usageData: 'synthetic_subscription_snapshots', users: [], checks: { ...manifest.purchaseChecks } };
    let publicCatalog = (await request(admin, 'GET', '/api/subscription/plans')).body.data.map(x => x.plan);
    for (const [key] of personas) {
      const user = manifest.users[key];
      let auth = userSessions.get(user.username);
      if (!auth && selfChecks.has(key)) { auth = await login(user.username, passwordFor(user.username, env)); sessions.push(auth); }
      if (auth) check(auth.id === user.id, 'self account ownership');
      const self = (await request(auth || admin, 'GET', auth ? '/api/user/self' : '/api/user/' + user.id)).body.data;
      if (auth) publicCatalog = (await request(auth, 'GET', '/api/subscription/plans')).body.data.map(x => x.plan);
      const catalog = publicCatalog;
      const subscriptions = auth ? (await request(auth, 'GET', '/api/subscription/self')).body.data : {
        all_subscriptions: (await request(admin, 'GET', '/api/subscription/admin/users/' + user.id + '/subscriptions')).body.data,
      };
      const all = subscriptions.all_subscriptions.map(s => s.subscription);
      const active = subscriptions.subscriptions ? subscriptions.subscriptions.map(s => s.subscription)
        : all.filter(s => s.status === 'active' && s.end_time > Date.now() / 1000);
      const expectedVisible = Object.values(manifest.plans).filter(plan => plan.enabled);
      check(catalog.filter(p => p.title.startsWith(prefix)).length === expectedVisible.length
        && Object.values(manifest.plans).every(plan => catalog.some(item => item.id === plan.id) === plan.enabled), 'visible and hidden catalog');
      const charge = user.subscriptions.filter(s => s.scenario === 'purchase').reduce((sum, s) => sum + Math.ceil(manifest.plans[s.planKey].price_amount * unit), 0);
      check(self.quota === user.initialWallet - charge, 'exact fixture wallet charge');
      for (const entry of user.subscriptions) {
        const sub = all.find(s => s.id === entry.id);
        check(sub?.user_id === user.id && sub.plan_id === entry.planId, 'subscription ownership');
        if (entry.scenario === 'expired') check(sub.end_time < Date.now() / 1000 && !active.some(s => s.id === sub.id), 'expired history');
        else if (entry.scenario === 'cancelled') check(sub.status === 'cancelled' && !active.some(s => s.id === sub.id), 'cancelled history');
        else check(active.some(s => s.id === sub.id), 'active subscription');
        if (entry.scenario !== 'refresh') check(sub.amount_used === entry.snapshot.amount_used, 'synthetic usage snapshot');
        if (entry.planKey === 'unlimited') check(sub.amount_total === 0, 'unlimited quota');
        if (entry.planKey === 'nooverflow') check(sub.allow_wallet_overflow === false && sub.amount_used === sub.amount_total, 'exhausted without overflow');
      }
      if (args[0] === '--apply' && ['limited', 'lowwallet'].includes(key) && !report.checks[key]) {
        const planId = key === 'limited' ? manifest.plans.limited.id : manifest.plans.month.id;
        const adapter = purchaserFor(auth, user.id, status, adapters);
        const preflight = await adapter.purchaser.prepare(user.id, planId);
        check(preflight.state === 'rejected' && preflight.error === (key === 'limited' ? 'limit' : 'balance') && adapter.posts() === 0, 'client preflight rejects without payment');
        const rejected = await request(auth, 'POST', '/api/subscription/balance/pay', { plan_id: planId }, true);
        check(rejected.body.success === false && (key === 'limited' ? /购买上限/.test(rejected.body.message) : /余额不足/.test(rejected.body.message)), 'expected purchase rejection');
        const after = (await request(auth, 'GET', '/api/user/self')).body.data;
        const afterSubs = (await request(auth, 'GET', '/api/subscription/self')).body.data.all_subscriptions;
        check(after.quota === self.quota && afterSubs.length === all.length, 'rejected purchase leaves balance and subscriptions unchanged');
        report.checks[key] = 'rejected_without_charge';
        manifest.purchaseChecks = report.checks;
        save(manifestPath, manifest);
      }
      if (key === 'lowwallet') check(self.quota < manifest.plans.month.price_amount * unit, 'insufficient wallet fixture');
      report.users.push({ username: user.username, displayName: self.display_name, id: user.id, verifiedVia: auth ? 'self' : 'admin', walletQuota: self.quota, walletUSD: self.quota / unit,
        clientPurchases: user.clientPurchases || 0,
        subscriptions: all.map(s => ({ id: s.id, planId: s.plan_id, status: s.status, source: s.source, amountTotal: s.amount_total,
          amountUsed: s.amount_used, endTime: s.end_time, nextResetTime: s.next_reset_time })) });
    }
    if (args[0] === '--apply') report.checks.naturalReset = (await checkNaturalReset(admin, manifest)).naturalReset;
    save(path.join(directory, 'report.json'), report);
    save(path.join(directory, 'resource-status.json'), { checkedAt: report.checkedAt, origin, database: local.database,
      identity: local.identity, accountsReady: true, plansReady: true, purchaseReady: true, pending: [],
      accounts: report.users.map(u => ({ username: u.username, displayName: u.displayName, id: u.id })) });
    console.log(JSON.stringify({ origin, plans: report.planCount, users: report.users.length,
      subscriptions: report.users.reduce((count, u) => count + u.subscriptions.length, 0), originalRecordsPreserved: true, checks: report.checks,
      report: path.relative(path.resolve(__dirname, '..'), path.join(directory, 'report.json')) }, null, 2));
  } finally {
    for (const auth of sessions) {
      try { await request(auth, 'POST', '/api/user/auth/logout', { sid: auth.sid }); }
      catch { /* Do not dump session details on cleanup failure. */ }
    }
  }
}

module.exports = {
  readFixturePassword: username => passwordFor(username, local.env),
  fixturePlanDefinitions: plans.map(definition => [...definition]),
};
if (require.main === module) run().catch(error => {
  console.error(error instanceof Error && /^(Fixture check failed:|Local (request|response))/.test(error.message)
    ? error.message : 'Local fixture preparation failed; sensitive details omitted.');
  process.exitCode = 1;
});
