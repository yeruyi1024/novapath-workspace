import fs from 'node:fs';
import path from 'node:path';

/** Recover a process interrupted between the two directory renames. */
export function recoverBundledSkillReplacementSync(target: string): void {
  if (fs.existsSync(target)) return;
  const backupRoot = path.join(path.dirname(path.dirname(target)), 'skill-backups');
  if (!fs.existsSync(backupRoot)) return;
  const transactions = fs.readdirSync(backupRoot).filter(name => name.startsWith(`${path.basename(target)}-`))
    .map(name => path.join(backupRoot, name)).filter(dir => fs.statSync(dir).isDirectory())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const transaction of transactions) {
    const previous = path.join(transaction, 'previous');
    const manifest = path.join(transaction, 'replacement.json');
    if (!fs.existsSync(previous) || !fs.existsSync(manifest)) continue;
    let originalTarget: unknown;
    try {
      originalTarget = JSON.parse(fs.readFileSync(manifest, 'utf8')).target;
    } catch {
      // A damaged audit record must not prevent recovery from another backup.
      continue;
    }
    if (originalTarget !== target) continue;
    fs.renameSync(previous, target);
    return;
  }
}

/** Stage before replacing. Backups live outside the discoverable SKILLs root. */
export function replaceBundledSkillSync(source: string, target: string, options: { preserveTimestamps?: boolean } = {}): string {
  const backupRoot = path.join(path.dirname(path.dirname(target)), 'skill-backups');
  fs.mkdirSync(backupRoot, { recursive: true });
  const transaction = fs.mkdtempSync(path.join(backupRoot, `${path.basename(target)}-`));
  const staged = path.join(transaction, 'staged');
  const previous = path.join(transaction, 'previous');
  let moved = false;
  try {
    fs.cpSync(source, staged, { recursive: true, dereference: true, errorOnExist: true, preserveTimestamps: options.preserveTimestamps ?? false });
    if (!fs.existsSync(path.join(staged, 'SKILL.md'))) throw new Error('Bundled skill entrypoint missing');
    for (const filename of ['.env', 'accounts.json']) {
      const existing = path.join(target, filename);
      if (fs.existsSync(existing)) fs.copyFileSync(existing, path.join(staged, filename));
    }
    fs.writeFileSync(path.join(transaction, 'replacement.json'), JSON.stringify({ target }));
    fs.renameSync(target, previous);
    moved = true;
    fs.renameSync(staged, target);
    return previous;
  } catch (error) {
    if (moved && !fs.existsSync(target)) fs.renameSync(previous, target);
    // Only generated staging data is removed. The old skill and user files survive.
    fs.rmSync(staged, { recursive: true, force: true });
    throw error;
  }
}
