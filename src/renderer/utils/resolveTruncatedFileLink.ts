/** Recover a shortened directory only from an unambiguous known session file. */
export function resolveTruncatedFileLink(
  linkPath: string,
  knownPaths: readonly string[],
): string | null {
  const normalized = linkPath.replace(/\\/g, '/');
  const separator = normalized.lastIndexOf('/');
  const directory = normalized.slice(0, separator);
  if (separator < 0 || !/(?:…|\.{3})/.test(directory) || /(?:…|\.{3})/.test(normalized.slice(separator + 1))) {
    return null;
  }
  const parts = normalized.split(/…|\.{3}/);
  const suffix = parts[parts.length - 1];
  const matches = new Set<string>();
  for (const path of knownPaths) {
    const candidate = path.replace(/\\/g, '/');
    if (/(?:…|\.{3})/.test(candidate) || !candidate.startsWith(parts[0]) || !candidate.endsWith(suffix)) continue;
    let offset = parts[0].length;
    let matchesMiddle = true;
    for (const part of parts.slice(1, -1)) {
      const index = candidate.indexOf(part, offset);
      if (index < 0) { matchesMiddle = false; break; }
      offset = index + part.length;
    }
    if (matchesMiddle && offset <= candidate.length - suffix.length) matches.add(path);
  }
  return matches.size === 1 ? [...matches][0] : null;
}
