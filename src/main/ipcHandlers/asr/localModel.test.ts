import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import manifest from '../../../shared/asr/local-runtime.json';
import { createLocalModelInstaller } from './localModel';
import { localAsrModelPath } from './localRuntime';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })));
});
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'starpath-asr-test-'));
  directories.push(directory);
  const data = Buffer.from('verified speech model');
  const model = { ...manifest.model, url: 'https://models.example/model', bytes: data.length,
    sha256: createHash('sha256').update(data).digest('hex') };
  const progress = vi.fn();
  return { directory, data, model, progress, destination: localAsrModelPath(directory) };
}
describe('first-use local speech pack', () => {
  test('checks bytes and hash before atomic installation and emits actual progress', async () => {
    const f = await fixture();
    const request = vi.fn(async () => new Response(f.data));
    const installer = createLocalModelInstaller({ userDataPath: f.directory, model: f.model, progress: f.progress, fetch: request });
    expect(await installer.prepare(7, 'download-1')).toEqual({ success: true, text: '' });
    expect(await fs.readFile(f.destination)).toEqual(f.data);
    expect(request).toHaveBeenCalledWith(f.model.url, expect.objectContaining({ credentials: 'omit', signal: expect.any(AbortSignal) }));
    expect(f.progress).toHaveBeenLastCalledWith(7, { requestId: 'download-1', received: f.data.length, total: f.data.length, verifying: true });
    expect(await fs.readdir(path.dirname(f.destination))).toEqual([path.basename(f.destination)]);
  });
  test.each(['truncated', 'oversized', 'corrupt'])('%s downloads preserve existing files and clean partials', async kind => {
    const f = await fixture();
    await fs.mkdir(path.dirname(f.destination), { recursive: true });
    await fs.writeFile(f.destination, 'previous model');
    const data = kind === 'truncated' ? f.data.subarray(1) : kind === 'oversized' ? Buffer.concat([f.data, Buffer.from('extra')]) : Buffer.alloc(f.data.length);
    const installer = createLocalModelInstaller({ userDataPath: f.directory, model: f.model, progress: f.progress, fetch: async () => new Response(data) });
    expect(await installer.prepare(7, 'download-2')).toEqual({ success: false, error: 'failed' });
    expect(await fs.readFile(f.destination, 'utf8')).toBe('previous model');
    expect(await fs.readdir(path.dirname(f.destination))).toEqual([path.basename(f.destination)]);
  });
  test('rejects declared length and releases the response body', async () => {
    const f = await fixture();
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const installer = createLocalModelInstaller({ userDataPath: f.directory, model: f.model, progress: f.progress,
      fetch: async () => new Response(stream, { headers: { 'content-length': '1' } }) });
    expect(await installer.prepare(7, 'download-3')).toEqual({ success: false, error: 'failed' });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  test('rejects traversal request IDs without requesting anything', async () => {
    const f = await fixture();
    const request = vi.fn();
    const installer = createLocalModelInstaller({ userDataPath: f.directory, model: f.model, progress: f.progress, fetch: request });
    expect(await installer.prepare(7, '../escape')).toEqual({ success: false, error: 'failed' });
    expect(request).not.toHaveBeenCalled();
  });
  test('owner and request guards protect a new download from old cancellation', async () => {
    const f = await fixture();
    const request = vi.fn((_url: string | URL | Request, options?: RequestInit): Promise<Response> => new Promise((_, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    const installer = createLocalModelInstaller({ userDataPath: f.directory, model: f.model, progress: f.progress, fetch: request });
    const first = installer.prepare(7, 'old');
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(await installer.prepare(8, 'new')).toEqual({ success: false, error: 'busy' });
    installer.cancel(8, 'old');
    installer.cancel(7, 'other');
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(false);
    installer.cancel(7, 'old');
    expect(await first).toEqual({ success: false, error: 'cancelled' });
    const next = installer.prepare(7, 'new');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    installer.cancel(7, 'old');
    expect(request.mock.calls[1][1]?.signal?.aborted).toBe(false);
    installer.cancelAll();
    expect(await next).toEqual({ success: false, error: 'cancelled' });
    expect(await fs.readdir(path.dirname(f.destination))).toEqual([]);
  });
  test('server errors expose only a stable error', async () => {
    const f = await fixture();
    const installer = createLocalModelInstaller({ userDataPath: f.directory, model: f.model, progress: f.progress,
      fetch: async () => new Response('private server diagnostic', { status: 503 }) });
    expect(await installer.prepare(7, 'download-4')).toEqual({ success: false, error: 'network' });
  });
});
