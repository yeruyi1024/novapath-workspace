import { describe, expect, test, vi } from 'vitest';

import { buildPcm16WavHeader } from '../../../renderer/services/voiceInput/wavEncoder';
import { GATEWAY_AUDIO_MAX_BYTES } from '../../../shared/asr/gateway';
import {
  createGatewayTranscriptionService,
  isValidVoiceWav,
  selectTranscriptionModel,
} from './gatewayTranscription';

const config = {
  baseURL: 'https://gateway.example/v1',
  apiKey: 'fake-test-key',
  modelIds: ['whisper-1'],
};
const wav = () => {
  const audio = new Uint8Array(16044);
  audio.set(buildPcm16WavHeader(16000, 16000));
  return audio;
};
const input = () => ({ requestId: 'request-1', audio: wav() });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('gateway transcription', () => {
  test('refreshes catalog without exposing credentials or switching conversation model', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ data: [{ id: 'chat-only' }, { id: 'whisper-1' }] }));
    const source = { ...config, modelIds: ['chat-only'] };
    const service = createGatewayTranscriptionService({ getConfig: () => source, fetch: request });
    expect(await service.status()).toEqual({ success: true, model: 'whisper-1' });
    expect(source.modelIds).toEqual(['chat-only']);
    expect(request.mock.calls[0][0]).toBe('https://gateway.example/v1/models');
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'Bearer fake-test-key' },
    });
  });
  test('does not pretend chat, TTS or diarization-only models support this request format', () => {
    expect(
      selectTranscriptionModel(['gpt-4o', 'tts-1', 'gpt-4o-transcribe-diarize']),
    ).toBeUndefined();
    expect(selectTranscriptionModel(['gpt-4o-mini-transcribe', 'whisper-1'])).toBe('whisper-1');
  });
  test('missing configuration and unsupported catalog are explicit errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [{ id: 'chat' }] }));
    expect(
      await createGatewayTranscriptionService({ getConfig: () => null, fetch: request }).status(),
    ).toEqual({ success: false, error: 'platform' });
    expect(request).not.toHaveBeenCalled();
    expect(
      await createGatewayTranscriptionService({
        getConfig: () => ({ ...config, modelIds: [] }),
        fetch: request,
      }).status(),
    ).toEqual({ success: false, error: 'model' });
  });
  test('posts bounded WAV multipart to configured gateway, not old service', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(json({ text: '  星途测试文字  ' }));
    const service = createGatewayTranscriptionService({ getConfig: () => config, fetch: request });
    expect(await service.transcribe(1, input())).toEqual({ success: true, text: '星途测试文字' });
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://gateway.example/v1/audio/transcriptions');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
    const form = options!.body as FormData;
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('response_format')).toBe('json');
    const file = form.get('file') as File;
    expect(file.name).toBe('recording.wav');
    expect(file.type).toBe('audio/wav');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(wav());
  });
  test.each([
    [401, 'auth'],
    [403, 'auth'],
    [402, 'quota'],
    [429, 'quota'],
    [404, 'model'],
    [500, 'failed'],
  ] as const)('redacts server errors for HTTP %i', async (status, error) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error: { message: 'sensitive-fake-key' } }, status));
    const service = createGatewayTranscriptionService({ getConfig: () => config, fetch: request });
    expect(await service.transcribe(1, input())).toEqual({ success: false, error });
  });
  test('rejects malformed, too short and oversized audio before any request', async () => {
    const request = vi.fn<typeof fetch>();
    const service = createGatewayTranscriptionService({ getConfig: () => config, fetch: request });
    for (const audio of [
      new Uint8Array(100),
      new Uint8Array(GATEWAY_AUDIO_MAX_BYTES + 1),
      wav().fill(0),
    ]) {
      expect(await service.transcribe(1, { requestId: 'valid-id', audio })).toEqual({
        success: false,
        error: 'audio',
      });
    }
    expect(await service.transcribe(1, { ...input(), requestId: '../bad' })).toEqual({
      success: false,
      error: 'audio',
    });
    expect(request).not.toHaveBeenCalled();
  });
  test('validates sample rate and channel count, including offset typed arrays', () => {
    const bytes = wav();
    expect(isValidVoiceWav(bytes)).toBe(true);
    const backing = new Uint8Array(bytes.length + 7);
    backing.set(bytes, 7);
    expect(isValidVoiceWav(backing.subarray(7))).toBe(true);
    new DataView(bytes.buffer).setUint16(22, 2, true);
    expect(isValidVoiceWav(bytes)).toBe(false);
    new DataView(bytes.buffer).setUint16(22, 1, true);
    new DataView(bytes.buffer).setUint32(24, 48000, true);
    expect(isValidVoiceWav(bytes)).toBe(false);
  });
  test('cancellation is owner/request-scoped and suppresses late results; concurrency is bounded', async () => {
    let complete!: (r: Response) => void;
    const request = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise(resolve => {
          complete = resolve;
        }),
    );
    const service = createGatewayTranscriptionService({ getConfig: () => config, fetch: request });
    const pending = service.transcribe(1, input());
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(await service.transcribe(1, input())).toEqual({ success: false, error: 'busy' });
    const signal = request.mock.calls[0][1]!.signal!;
    service.cancel(2, 'request-1');
    service.cancel(1, 'other-request');
    expect(signal.aborted).toBe(false);
    service.cancel(1, 'request-1');
    expect(signal.aborted).toBe(true);
    complete(json({ text: 'late transcript' }));
    expect(await pending).toEqual({ success: false, error: 'cancelled' });
    request.mockResolvedValue(json({ text: 'new recording' }));
    expect(await service.transcribe(1, { ...input(), requestId: 'new' })).toEqual({
      success: true,
      text: 'new recording',
    });
  });
  test('empty, oversized and malformed results fail safely', async () => {
    const request = vi.fn<typeof fetch>();
    const service = createGatewayTranscriptionService({ getConfig: () => config, fetch: request });
    request.mockResolvedValue(json({ text: '   ' }));
    expect(await service.transcribe(1, input())).toEqual({ success: false, error: 'empty' });
    request.mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1)));
    expect(await service.transcribe(1, input())).toEqual({ success: false, error: 'network' });
  });
  test('rejects credential-bearing or non-HTTP endpoint before uploading', async () => {
    const request = vi.fn<typeof fetch>();
    for (const baseURL of [
      'file:///tmp',
      'https://user:password@example.com/v1',
      'https://example.com/v1?key=secret',
    ]) {
      const service = createGatewayTranscriptionService({
        getConfig: () => ({ ...config, baseURL }),
        fetch: request,
      });
      expect((await service.transcribe(1, input())).success).toBe(false);
    }
    expect(request).not.toHaveBeenCalled();
  });
  test('credential storage failure is contained without exposing storage errors', async () => {
    const service = createGatewayTranscriptionService({
      getConfig: () => {
        throw new Error('secret-storage-details');
      },
    });
    expect(await service.status()).toEqual({ success: false, error: 'platform' });
    expect(await service.transcribe(1, input())).toEqual({ success: false, error: 'platform' });
  });
  test('deadline reports timeout and releases the window for retry', async () => {
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort(new DOMException('Deadline', 'TimeoutError')));
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      options?.signal?.throwIfAborted();
      return json({ text: 'done' });
    });
    try {
      const service = createGatewayTranscriptionService({
        getConfig: () => config,
        fetch: request,
      });
      expect(await service.transcribe(1, input())).toEqual({ success: false, error: 'timeout' });
      timeout.mockReturnValue(new AbortController().signal);
      expect(await service.transcribe(1, input())).toEqual({ success: true, text: 'done' });
    } finally {
      timeout.mockRestore();
    }
  });
});
