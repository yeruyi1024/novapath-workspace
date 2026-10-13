import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { GatewayAsrResult } from '../../../shared/asr/gateway';
import type { LocalAsrProgress } from '../../../shared/asr/local';
import manifest from '../../../shared/asr/local-runtime.json';
import { localAsrModelPath } from './localRuntime';

interface Dependencies {
  userDataPath: string;
  fetch?: typeof fetch;
  // Injectable manifest lets tests exercise real disk writes with small fixtures.
  model?: typeof manifest.model;
  progress: (owner: number, progress: LocalAsrProgress) => void;
}

export function createLocalModelInstaller({ userDataPath, fetch: request = fetch, model = manifest.model, progress }: Dependencies) {
  let active: { owner: number; requestId: string; controller: AbortController } | null = null;
  const cancel = (owner: number, requestId?: string) => {
    if (active?.owner === owner && (!requestId || active.requestId === requestId)) active.controller.abort();
  };
  const cancelAll = () => active?.controller.abort();
  const prepare = async (owner: number, requestId: unknown): Promise<GatewayAsrResult> => {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(requestId)) return { success: false, error: 'failed' };
    if (active) return { success: false, error: 'busy' };
    const job = { owner, requestId, controller: new AbortController() };
    active = job;
    const signal = AbortSignal.any([job.controller.signal, AbortSignal.timeout(15 * 60_000)]);
    const destination = localAsrModelPath(userDataPath);
    const temporary = `${destination}.${requestId}.partial`;
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const response = await request(model.url, { signal, credentials: 'omit' });
      reader = response.body?.getReader();
      if (!response.ok || !response.body) return { success: false, error: 'network' };
      const declaredLength = Number(response.headers.get('content-length'));
      if (declaredLength && declaredLength !== model.bytes) return { success: false, error: 'failed' };
      file = await fs.open(temporary, 'wx', 0o600);
      const hash = createHash('sha256');
      let received = 0;
      let notifiedAt = 0;
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader!.read();
        if (done) break;
        received += value.byteLength;
        if (received > model.bytes) return { success: false, error: 'failed' };
        hash.update(value);
        // writeFile on an open descriptor handles partial writes without buffering the model.
        await file.writeFile(value);
        if (Date.now() - notifiedAt >= 200 || received === model.bytes) {
          progress(owner, { requestId, received, total: model.bytes, verifying: false });
          notifiedAt = Date.now();
        }
      }
      progress(owner, { requestId, received, total: model.bytes, verifying: true });
      if (received !== model.bytes || hash.digest('hex') !== model.sha256) return { success: false, error: 'failed' };
      signal.throwIfAborted();
      await file.close();
      file = undefined;
      signal.throwIfAborted();
      await fs.rename(temporary, destination);
      return { success: true, text: '' };
    } catch {
      return { success: false, error: job.controller.signal.aborted ? 'cancelled' : signal.aborted ? 'timeout' : 'network' };
    } finally {
      await reader?.cancel().catch((): void => undefined);
      await file?.close().catch((): void => undefined);
      await fs.rm(temporary, { force: true }).catch((): void => undefined);
      if (active === job) active = null;
    }
  };
  return { prepare, cancel, cancelAll };
}
