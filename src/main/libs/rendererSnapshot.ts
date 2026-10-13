import fs from 'node:fs';
import path from 'node:path';

/** A running local production preview must not read chunks from a mutable dist. */
export function createRendererSnapshot(source: string, temporaryRoot: string): {
  entry: string;
  dispose: () => void;
} {
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'starpath-renderer-'));
  const dispose = () => fs.rmSync(directory, { recursive: true, force: true });
  try {
    fs.cpSync(source, directory, { recursive: true });
    const entry = path.join(directory, 'index.html');
    if (!fs.statSync(entry).isFile()) throw new Error('Renderer entry is unavailable');
    return { entry, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
