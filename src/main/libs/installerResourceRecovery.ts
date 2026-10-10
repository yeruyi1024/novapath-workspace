import fs from 'fs';
import path from 'path';
import * as tar from 'tar';

/**
 * Recovery for Windows installs where the NSIS installer stopped (killed by
 * the user, or its extractor child was frozen by security software) after the
 * main app files were extracted but before win-resources.tar was unpacked.
 * In that state the app launches, but resources/cfmind, python-win, mingit and SKILLs
 * are empty directories; the tar preserved next to them is the only local
 * source of the OpenClaw runtime. The installer only deletes the tar after a
 * successful extraction, so we can finish its job here.
 */

export const INSTALLER_RESOURCES_TAR = 'win-resources.tar';
/** Written after a successful extraction, by the installer or by this module. */
export const INSTALLER_RESOURCES_MARKER = '.win-resources-extracted';

const GATEWAY_BUNDLE_ENTRY = path.join('cfmind', 'gateway-bundle.mjs');
const GATEWAY_BUNDLE_REQUIRED_ASSETS = [path.join('cfmind', 'web-tree-sitter.wasm')];

// Mirrors the fallback candidates of OpenClawEngineManager.resolveOpenClawEntry.
// The optimized root bundle is only usable when its root-relative assets are
// present; otherwise recovery must not treat a partial extraction as complete.
const RUNTIME_FALLBACK_ENTRY_CANDIDATES = [
  path.join('cfmind', 'openclaw.mjs'),
  path.join('cfmind', 'dist', 'entry.js'),
  path.join('cfmind', 'gateway.asar'),
];

const PROGRESS_LOG_STEP_BYTES = 50 * 1024 * 1024;

export interface InstallerResourceRecoveryProgress {
  entries: number;
  bytes: number;
  totalBytes: number;
}

export interface InstallerResourceRecoveryResult {
  /** True when an extraction was actually started. */
  attempted: boolean;
  /** True when a complete runtime entry is present (recovered now, or already intact). */
  success: boolean;
  tarPath: string;
  entries?: number;
  elapsedMs?: number;
  error?: string;
}

export const hasBundledRuntimeEntry = (resourcesDir: string): boolean => {
  if (fs.existsSync(path.join(resourcesDir, GATEWAY_BUNDLE_ENTRY))) {
    return GATEWAY_BUNDLE_REQUIRED_ASSETS.every((asset) =>
      fs.existsSync(path.join(resourcesDir, asset)),
    );
  }

  return RUNTIME_FALLBACK_ENTRY_CANDIDATES.some((candidate) =>
    fs.existsSync(path.join(resourcesDir, candidate)),
  );
};

const stringifyError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const hasBundledPortableGit = (resourcesDir: string): boolean => {
  const root = path.join(resourcesDir, 'mingit');
  const hasBash = ['bin/bash.exe', 'usr/bin/bash.exe'].some((file) => fs.existsSync(path.join(root, file)));
  const hasGit = ['cmd/git.exe', 'bin/git.exe', 'mingw64/bin/git.exe'].some((file) => fs.existsSync(path.join(root, file)));
  try {
    return hasBash && hasGit && ['dev/shm', 'dev/mqueue'].every((dir) => fs.statSync(path.join(root, dir)).isDirectory());
  } catch {
    return false;
  }
};

const doRecover = async (
  resourcesDir: string,
  reason: string,
  onProgress?: (progress: InstallerResourceRecoveryProgress) => void,
): Promise<InstallerResourceRecoveryResult> => {
  const tarPath = path.join(resourcesDir, INSTALLER_RESOURCES_TAR);
  const markerPath = path.join(resourcesDir, INSTALLER_RESOURCES_MARKER);

  if (!fs.existsSync(tarPath)) {
    if (hasBundledRuntimeEntry(resourcesDir)) {
      return { attempted: false, success: true, tarPath };
    }
    console.warn(
      `[InstallerRecovery] runtime entry or required bundle assets are missing and no installer tar ` +
        `is left to recover from ` +
        `(reason=${reason}, extractedMarker=${fs.existsSync(markerPath)}, dir=${resourcesDir})`,
    );
    return { attempted: false, success: false, tarPath, error: 'installer resource tar not found' };
  }

  let totalBytes = 0;
  try {
    totalBytes = fs.statSync(tarPath).size;
  } catch {
    // Progress percentages become unavailable; extraction can still proceed.
  }

  const t0 = Date.now();
  let entries = 0;
  let bytes = 0;
  let nextProgressBytes = PROGRESS_LOG_STEP_BYTES;
  let archiveIncludesPortableGit = false;
  console.log(
    `[InstallerRecovery] completing retained installer resources, extracting ` +
      `${tarPath} -> ${resourcesDir} ` +
      `(reason=${reason}, tarBytes=${totalBytes})`,
  );
  onProgress?.({ entries: 0, bytes: 0, totalBytes });

  try {
    await tar.extract({
      file: tarPath,
      cwd: resourcesDir,
      onReadEntry: (entry) => {
        const relative = String(entry.path).replace(/\\/g, '/').replace(/^(\.\/)+/, '');
        if (/^mingit(?:\/|$)/i.test(relative)) archiveIncludesPortableGit = true;
        entries += 1;
        bytes += Number(entry.size ?? 0);
        if (bytes >= nextProgressBytes) {
          while (bytes >= nextProgressBytes) {
            nextProgressBytes += PROGRESS_LOG_STEP_BYTES;
          }
          console.log(
            `[InstallerRecovery] extract progress: entries=${entries} ` +
              `mb=${(bytes / (1024 * 1024)).toFixed(0)} elapsedMs=${Date.now() - t0}`,
          );
          onProgress?.({ entries, bytes, totalBytes });
        }
      },
    });
  } catch (error) {
    console.error(
      `[InstallerRecovery] extraction failed after ${Date.now() - t0}ms (entries=${entries}), ` +
        `keeping ${tarPath} for a later retry:`,
      error,
    );
    return {
      attempted: true,
      success: false,
      tarPath,
      entries,
      elapsedMs: Date.now() - t0,
      error: stringifyError(error),
    };
  }

  const elapsedMs = Date.now() - t0;
  // Old installer archives did not contain PortableGit. Require its contents
  // only when this archive ships it, preserving recovery of those old builds.
  if (archiveIncludesPortableGit && !hasBundledPortableGit(resourcesDir)) {
    console.error(`[InstallerRecovery] PortableGit resources are still missing after extraction, keeping ${tarPath}`);
    return {
      attempted: true,
      success: false,
      tarPath,
      entries,
      elapsedMs,
      error: 'PortableGit required resources are still missing after extraction',
    };
  }

  if (!hasBundledRuntimeEntry(resourcesDir)) {
    console.error(
      `[InstallerRecovery] extraction finished (entries=${entries}, elapsedMs=${elapsedMs}) ` +
        `but the runtime entry or required bundle assets are still missing, keeping ${tarPath}`,
    );
    return {
      attempted: true,
      success: false,
      tarPath,
      entries,
      elapsedMs,
      error: 'runtime entry or required bundle assets are still missing after extraction',
    };
  }

  // Mirror the installer's success path: stamp the marker, drop the archive.
  try {
    fs.writeFileSync(markerPath, `${new Date().toISOString()} source=app-recovery reason=${reason}\n`);
  } catch (error) {
    console.warn('[InstallerRecovery] failed to write extraction marker:', error);
  }
  try {
    fs.rmSync(tarPath);
  } catch (error) {
    console.warn(`[InstallerRecovery] recovered, but failed to remove ${tarPath}:`, error);
  }

  console.log(`[InstallerRecovery] runtime recovered from installer tar (entries=${entries}, elapsedMs=${elapsedMs})`);
  return { attempted: true, success: true, tarPath, entries, elapsedMs };
};

let inflightRecovery: Promise<InstallerResourceRecoveryResult> | null = null;

/**
 * Complete a retained win-resources.tar even if OpenClaw was already extracted.
 * The tar is deleted only after the runtime entry and any PortableGit payload
 * are confirmed present, so a failed attempt (e.g. security
 * software still holding files) can be retried later. Concurrent calls share
 * one extraction. Cheap no-op when no archive remains and the runtime is intact.
 */
export const recoverInstallerResourcesFromTar = (
  resourcesDir: string,
  reason: string,
  onProgress?: (progress: InstallerResourceRecoveryProgress) => void,
): Promise<InstallerResourceRecoveryResult> => {
  if (inflightRecovery) {
    return inflightRecovery;
  }
  const promise = doRecover(resourcesDir, reason, onProgress).finally(() => {
    if (inflightRecovery === promise) {
      inflightRecovery = null;
    }
  });
  inflightRecovery = promise;
  return promise;
};
