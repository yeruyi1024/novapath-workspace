import type { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { buildPcm16WavHeader } from '../../../renderer/services/voiceInput/wavEncoder';
import { LocalAsrModelUnavailable } from './localRuntime';
import { createLocalTranscriptionService } from './localTranscription';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
function audio(silent = false) {
  const wav = new Uint8Array(44 + 16000);
  wav.set(buildPcm16WavHeader(16000, 16000));
  if (!silent) for (let i = 44; i < wav.length; i += 2) new DataView(wav.buffer).setInt16(i, 1200, true);
  return wav;
}
function worker() {
  return Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() });
}
function fixture(timeoutMs = 1000) {
  const children: ReturnType<typeof worker>[] = [];
  const start = vi.fn((..._args: Parameters<typeof spawn>) => { const child = worker(); children.push(child); return child; });
  const getRuntime = vi.fn(async () => ({ executable: '/app path/whisper-cli', modelPath: '/user path/model.bin', model: 'offline-test' }));
  const service = createLocalTranscriptionService({ getRuntime, spawn: start as unknown as typeof spawn, timeoutMs });
  return { children, start, getRuntime, service };
}
describe('offline voice worker lifecycle', () => {
  test('readiness distinguishes missing engine from missing speech pack without a gateway', async () => {
    expect(await fixture().service.status()).toEqual({ success: true, model: 'offline-test' });
    expect(await createLocalTranscriptionService({ getRuntime: async () => null }).status()).toEqual({ success: false, error: 'resources' });
    expect(await createLocalTranscriptionService({ getRuntime: async () => { throw new LocalAsrModelUnavailable(); } }).status()).toEqual({ success: false, error: 'model' });
  });
  test('invalid input and silence never start a worker', async () => {
    const f = fixture();
    expect(await f.service.transcribe(1, { requestId: '../unsafe', audio: audio() })).toEqual({ success: false, error: 'audio' });
    expect(await f.service.transcribe(1, { requestId: 'valid', audio: new Uint8Array(2) })).toEqual({ success: false, error: 'audio' });
    expect(await f.service.transcribe(1, { requestId: 'silent', audio: audio(true) })).toEqual({ success: false, error: 'empty' });
    expect(f.start).not.toHaveBeenCalled();
    expect(f.getRuntime).not.toHaveBeenCalled();
  });
  test('pipes audio in memory, collects UTF-8 text, and excludes credentials and output formats', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-private-key');
    const f = fixture();
    const wav = audio();
    const result = f.service.transcribe(1, { requestId: 'first', audio: wav });
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledOnce());
    const [, args, options] = f.start.mock.calls[0];
    expect(args).toContain('--no-timestamps');
    expect(args).not.toContain('--output-txt');
    expect(args).not.toContain('--output-json');
    expect(options).toMatchObject({ shell: false, windowsHide: true, stdio: 'pipe' });
    expect(options?.env?.OPENAI_API_KEY).toBeUndefined();
    expect(f.children[0].stdin.read()).toEqual(Buffer.from(wav));
    f.children[0].stdout.write('  你好，星途。\n');
    f.children[0].emit('close', 0);
    expect(await result).toEqual({ success: true, text: '你好，星途。' });
  });
  test('allows only one loaded worker across windows', async () => {
    const f = fixture();
    const result = f.service.transcribe(1, { requestId: 'first', audio: audio() });
    expect(await f.service.transcribe(2, { requestId: 'second', audio: audio() })).toEqual({ success: false, error: 'busy' });
    f.service.cancelAll();
    expect(await result).toEqual({ success: false, error: 'cancelled' });
  });
  test('old cancellation and late process exit cannot affect a new recording', async () => {
    const f = fixture();
    const first = f.service.transcribe(1, { requestId: 'old', audio: audio() });
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledOnce());
    f.service.cancel(2, 'old');
    f.service.cancel(1, 'other');
    expect(f.children[0].kill).not.toHaveBeenCalled();
    f.service.cancel(1, 'old');
    expect(await first).toEqual({ success: false, error: 'cancelled' });
    expect(f.children[0].kill).toHaveBeenCalledWith('SIGKILL');
    const next = f.service.transcribe(1, { requestId: 'new', audio: audio() });
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledTimes(2));
    f.service.cancel(1, 'old');
    f.children[0].emit('close', 0);
    expect(f.children[1].kill).not.toHaveBeenCalled();
    f.children[1].stdout.write('new transcript');
    f.children[1].emit('close', 0);
    expect(await next).toEqual({ success: true, text: 'new transcript' });
  });
  test('timeout terminates the worker and releases the slot', async () => {
    vi.useFakeTimers();
    const f = fixture(50);
    const first = f.service.transcribe(1, { requestId: 'first', audio: audio() });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(51);
    expect(await first).toEqual({ success: false, error: 'timeout' });
    expect(f.children[0].kill).toHaveBeenCalledWith('SIGKILL');
    const second = f.service.transcribe(1, { requestId: 'second', audio: audio() });
    f.service.cancelAll();
    expect(await second).toEqual({ success: false, error: 'cancelled' });
  });
  test('timeout covers stalled resource lookup', async () => {
    vi.useFakeTimers();
    const service = createLocalTranscriptionService({ getRuntime: () => new Promise(() => undefined), timeoutMs: 50 });
    const result = service.transcribe(1, { requestId: 'first', audio: audio() });
    await vi.advanceTimersByTimeAsync(51);
    expect(await result).toEqual({ success: false, error: 'timeout' });
  });
  test('caps output and never forwards private diagnostics', async () => {
    const f = fixture();
    const result = f.service.transcribe(1, { requestId: 'first', audio: audio() });
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledOnce());
    f.children[0].stderr.write('private speech /user/path');
    f.children[0].stdout.write('x'.repeat(65537));
    expect(await result).toEqual({ success: false, error: 'failed' });
    expect(f.children[0].kill).toHaveBeenCalledOnce();
  });
  test.each(['error', 'stdin', 'exit', 'empty'])('%s failure is sanitized', async kind => {
    const f = fixture();
    const result = f.service.transcribe(1, { requestId: 'first', audio: audio() });
    await vi.waitFor(() => expect(f.start).toHaveBeenCalledOnce());
    if (kind === 'stdin') f.children[0].stdin.emit('error', new Error('private diagnostics'));
    else if (kind === 'error') f.children[0].emit('error', new Error('private diagnostics'));
    else f.children[0].emit('close', kind === 'exit' ? 1 : 0);
    expect(await result).toEqual({ success: false, error: kind === 'empty' ? 'empty' : 'failed' });
  });
});
