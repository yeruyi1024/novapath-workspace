import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterAll, beforeAll, expect, test } from 'vitest';

const patch = path.resolve('scripts/patches/v2026.8.1/openclaw-plugin-archive-windows-timeout.patch');
const wrapper = path.resolve('scripts/ensure-openclaw-plugins.cjs');
const require = createRequire(wrapper);
let root: string;
let patchedInstall: string;

// Only the two upstream hunk contexts are needed to exercise the real patch.
// The install callback returns the archive budget actually passed to extraction.
const upstream = `
type InternalPackageInstallCommonParams = Record<string, unknown>;
type InstallPluginResult = number;
const PLUGIN_ARCHIVE_ROOT_MARKERS = [
  "plugin.json",
];

function pickPackageInstallCommonParams(
  params: InternalPackageInstallCommonParams,
): InternalPackageInstallCommonParams {
  return params;
}
const defaultLogger = {};
async function loadPluginInstallRuntime() {
  return { withExtractedArchiveRoot: async (params: { timeoutMs: number }) => params.timeoutMs };
}
async function installPluginFromArchive(
  params: { timeoutMs?: number; mode?: string; installPolicyRequest?: Record<string, unknown> },
): Promise<InstallPluginResult> {
  const runtime = await loadPluginInstallRuntime();
  const logger = params.logger ?? defaultLogger;
  const timeoutMs = params.timeoutMs ?? 120_000;
  const mode = params.mode ?? "install";
  const installPolicyRequest = params.installPolicyRequest ?? {
    kind: "plugin-archive",
  };
  return runtime.withExtractedArchiveRoot({ timeoutMs, mode, logger, installPolicyRequest });
}
module.exports = { installPluginFromArchive };
`;

beforeAll(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-archive-budget-')));
  const file = path.join(root, 'src/plugins/install-package.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, upstream);
  for (const args of [['--check'], [], ['--reverse', '--check']]) {
    const result = spawnSync('git', ['apply', ...args, patch], { cwd: root, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  }
  patchedInstall = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'));
});

afterAll(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

test.each([
  ['darwin', 'x64', 900_000, 1_200_000],
  ['darwin', 'arm64', 120_000, 300_000],
  ['win32', 'x64', 900_000, 1_200_000],
  ['win32', 'arm64', 900_000, 1_200_000],
  ['linux', 'x64', 120_000, 300_000],
  ['linux', 'arm64', 120_000, 300_000],
])('keeps the %s/%s CLI alive beyond its patched archive deadline', async (platform, arch, archiveMs, cliMs) => {
  const host = { platform, arch };
  const installModule = { exports: {} as { installPluginFromArchive: (params: { timeoutMs?: number }) => Promise<number> } };
  runInNewContext(patchedInstall, { process: host, module: installModule });
  const actualArchiveMs = await installModule.exports.installPluginFromArchive({});
  expect(actualArchiveMs).toBe(archiveMs);
  // Explicit upstream caller budgets remain respected on every platform.
  expect(await installModule.exports.installPluginFromArchive({ timeoutMs: 42_000 })).toBe(42_000);

  const wrapperModule = { exports: {} as { timeoutMs: number } };
  runInNewContext(fs.readFileSync(wrapper, 'utf8') + '\nmodule.exports.timeoutMs = OPENCLAW_PLUGIN_INSTALL_TIMEOUT_MS;', {
    process: host, module: wrapperModule, require, console, __dirname: path.dirname(wrapper), __filename: wrapper,
  });
  expect(wrapperModule.exports.timeoutMs).toBe(cliMs);
  expect(wrapperModule.exports.timeoutMs).toBeGreaterThan(actualArchiveMs);
});
