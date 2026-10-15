import { type ChildProcessWithoutNullStreams,spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

import type { GatewayAsrError, GatewayAsrRequest, GatewayAsrResult, GatewayAsrStatus } from '../../../shared/asr/gateway';
import { isValidVoiceWav } from './gatewayTranscription';
import { LocalAsrModelUnavailable, type LocalAsrRuntime } from './localRuntime';

interface Dependencies {
  getRuntime: () => Promise<LocalAsrRuntime | null>;
  spawn?: typeof spawn;
  timeoutMs?: number;
}
interface Job {
  owner: number;
  requestId: string;
  controller: AbortController;
  abortError: GatewayAsrError;
}

export function isSilentVoiceWav(audio: Uint8Array): boolean {
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  let energy = 0;
  for (let offset = 44; offset < audio.byteLength; offset += 2) energy += view.getInt16(offset, true) ** 2;
  return Math.sqrt(energy / ((audio.byteLength - 44) / 2)) < 15;
}

export function createLocalTranscriptionService({ getRuntime, spawn: start = spawn, timeoutMs = 120_000 }: Dependencies) {
  // One worker per app prevents loading several copies of the model at once.
  let active: Job | null = null;
  const status = async (): Promise<GatewayAsrStatus> => {
    try {
      const runtime = await getRuntime();
      return runtime ? { success: true, model: runtime.model } : { success: false, error: 'resources' };
    } catch (error) { return { success: false, error: error instanceof LocalAsrModelUnavailable ? 'model' : 'resources' }; }
  };
  const cancel = (owner: number, requestId?: string) => {
    if (active?.owner === owner && (!requestId || active.requestId === requestId)) active.controller.abort();
  };
  const cancelAll = () => active?.controller.abort();
  const recognize = (job: Job, runtime: LocalAsrRuntime, audio: Uint8Array): Promise<GatewayAsrResult> => new Promise(resolve => {
    let child: ChildProcessWithoutNullStreams | undefined;
    let finished = false;
    let text = '';
    let bytes = 0;
    const finish = (result: GatewayAsrResult, terminate = false) => {
      if (finished) return;
      finished = true;
      job.controller.signal.removeEventListener('abort', abort);
      if (terminate) { try { child?.kill('SIGKILL'); } catch { /* A closed process needs no further cleanup. */ } }
      resolve(result);
    };
    const abort = () => finish({ success: false, error: job.abortError }, true);
    if (job.controller.signal.aborted) { abort(); return; }
    job.controller.signal.addEventListener('abort', abort, { once: true });
    try {
      // Do not pass provider credentials or arbitrary loader variables to the worker.
      const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP', 'TMPDIR', 'HOME', 'LANG']
        .flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
      child = start(runtime.executable, [
        // With stdin input, a non-stdout basename enables segment printing.
        // No output format is requested, so this does not write a file (also on Windows).
        '--model', runtime.modelPath, '--file', '-', '--output-file', 'starpath-voice-memory', '--language', 'auto',
        '--no-timestamps', '--no-prints', '--suppress-nst',
        '--threads', String(Math.max(1, Math.min(6, availableParallelism()))),
      ], { shell: false, windowsHide: true, stdio: 'pipe', env }) as ChildProcessWithoutNullStreams;
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (finished) return;
        bytes += Buffer.byteLength(chunk);
        if (bytes > 64 * 1024) { finish({ success: false, error: 'failed' }, true); return; }
        text += chunk;
      });
      // Diagnostics may contain speech or local paths; never forward or persist them.
      child.stderr.resume();
      child.once('error', () => finish({ success: false, error: 'failed' }, true));
      child.stdin.once('error', () => finish({ success: false, error: 'failed' }, true));
      child.once('close', code => {
        const transcript = text.replace(/\[(?:BLANK_AUDIO|SILENCE|NO_SPEECH)\]/g, '').trim();
        finish(code !== 0 ? { success: false, error: 'failed' }
          : transcript ? { success: true, text: transcript } : { success: false, error: 'empty' });
      });
      child.stdin.end(Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength));
    } catch { finish({ success: false, error: 'failed' }, true); }
  });
  const transcribe = async (owner: number, input: GatewayAsrRequest): Promise<GatewayAsrResult> => {
    if (!input || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(input.requestId)
      || !isValidVoiceWav(input.audio)) return { success: false, error: 'audio' };
    if (active) return { success: false, error: 'busy' };
    if (isSilentVoiceWav(input.audio)) return { success: false, error: 'empty' };
    const job: Job = { owner, requestId: input.requestId, controller: new AbortController(), abortError: 'cancelled' };
    active = job;
    const timer = setTimeout(() => { job.abortError = 'timeout'; job.controller.abort(); }, timeoutMs);
    let stopWaiting: (() => void) | undefined;
    try {
      const runtime = await Promise.race([getRuntime(), new Promise<null>(resolve => {
        stopWaiting = () => resolve(null);
        job.controller.signal.addEventListener('abort', stopWaiting, { once: true });
      })]);
      if (job.controller.signal.aborted) return { success: false, error: job.abortError };
      return runtime ? await recognize(job, runtime, input.audio) : { success: false, error: 'resources' };
    } catch (error) { return { success: false, error: error instanceof LocalAsrModelUnavailable ? 'model' : 'resources' }; }
    finally {
      clearTimeout(timer);
      if (stopWaiting) job.controller.signal.removeEventListener('abort', stopWaiting);
      if (active === job) active = null;
    }
  };
  return { status, transcribe, cancel, cancelAll };
}
