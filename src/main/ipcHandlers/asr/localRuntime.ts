import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';

import manifest from '../../../shared/asr/local-runtime.json';

export interface LocalAsrRuntime { executable: string; modelPath: string; model: string }
interface Paths {
  packaged: boolean;
  resourcesPath: string;
  appPath: string;
  userDataPath: string;
  platform: string;
  arch: string;
}

export class LocalAsrModelUnavailable extends Error {}

export function localAsrModelPath(userDataPath: string): string {
  return path.join(userDataPath, 'asr', `${manifest.model.id}.bin`);
}

export function localAsrDirectory(paths: Paths): string | null {
  const platform = { darwin: 'mac', win32: 'win', linux: 'linux' }[paths.platform];
  const target = `${platform}-${paths.arch}`;
  if (!manifest.targets.includes(target)) return null;
  return paths.packaged ? path.join(paths.resourcesPath, 'asr-runtime')
    : path.join(paths.appPath, 'resources', 'asr-runtime', target);
}

export function createLocalAsrRuntimeResolver(paths: Paths) {
  let verifiedModel: { fingerprint: string; result: Promise<boolean> } | null = null;
  return async (): Promise<LocalAsrRuntime | null> => {
    try {
      const directory = localAsrDirectory(paths);
      if (!directory) return null;
      const executable = path.join(directory, paths.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli');
      const [engineStat, metadataText] = await Promise.all([
        fs.stat(executable), fs.readFile(path.join(directory, 'manifest.json'), 'utf8'),
      ]);
      const metadata = JSON.parse(metadataText);
      const platform = { darwin: 'mac', win32: 'win', linux: 'linux' }[paths.platform];
      if (!engineStat.isFile()
        || metadata.target !== `${platform}-${paths.arch}` || metadata.engineVersion !== manifest.engineVersion
        || metadata.modelSha256 !== manifest.model.sha256) return null;
      for (const modelPath of [localAsrModelPath(paths.userDataPath), path.join(directory, 'model.bin')]) {
        const modelStat = await fs.stat(modelPath).catch((): null => null);
        if (!modelStat?.isFile() || modelStat.size !== manifest.model.bytes) continue;
        const fingerprint = `${modelPath}:${modelStat.size}:${modelStat.mtimeMs}:${modelStat.ctimeMs}`;
        if (verifiedModel?.fingerprint !== fingerprint) {
          verifiedModel = { fingerprint, result: (async () => {
            const hash = createHash('sha256');
            for await (const chunk of createReadStream(modelPath)) hash.update(chunk);
            return hash.digest('hex') === manifest.model.sha256;
          })() };
        }
        if (await verifiedModel.result) return { executable, modelPath, model: manifest.model.id };
      }
      throw new LocalAsrModelUnavailable();
    } catch (error) {
      if (error instanceof LocalAsrModelUnavailable) throw error;
      return null;
    }
  };
}
