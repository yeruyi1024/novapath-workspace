import { afterEach, describe, expect, test, vi } from 'vitest';

import { startRealtimeVoiceRecording } from './realtimeAudioRecorder';

vi.mock('../i18n', () => ({ i18nService: { t: (key: string) => key } }));
afterEach(() => vi.unstubAllGlobals());
function environment() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] };
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = node();
  const processor = {
    ...node(),
    onaudioprocess: null as
      ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null,
  };
  const gain = { ...node(), gain: { value: 1 } };
  const context = {
    state: 'running',
    sampleRate: 48000,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createMediaStreamSource: vi.fn(() => source),
    createScriptProcessor: vi.fn(() => processor),
    createGain: vi.fn(() => gain),
  };
  class AudioContextMock {
    constructor() {
      return context;
    }
  }
  const getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal('window', { AudioContext: AudioContextMock });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  return { track, source, processor, gain, context, getUserMedia };
}
describe('microphone recorder resource cleanup', () => {
  test('permission denial does not open an audio context', async () => {
    const { context, getUserMedia } = environment();
    getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    await expect(
      startRealtimeVoiceRecording({ chunkIntervalMillis: 250, onPcmChunk: vi.fn() }),
    ).rejects.toThrow('Denied');
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
  });
  test('startup failure after permission releases the microphone', async () => {
    const { track, context } = environment();
    context.createMediaStreamSource.mockImplementation(() => {
      throw new Error('device lost');
    });
    await expect(
      startRealtimeVoiceRecording({ chunkIntervalMillis: 250, onPcmChunk: vi.fn() }),
    ).rejects.toThrow('device lost');
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
  test('graph connection failure releases all nodes and microphone', async () => {
    const { track, source, processor, gain, context } = environment();
    processor.connect.mockImplementation(() => {
      throw new Error('graph');
    });
    await expect(
      startRealtimeVoiceRecording({ chunkIntervalMillis: 250, onPcmChunk: vi.fn() }),
    ).rejects.toThrow('graph');
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
  test('stop resamples to mono PCM16, flushes tail and closes exactly once even after cancel', async () => {
    const { track, processor, context } = environment();
    const onPcmChunk = vi.fn<(bytes: Uint8Array) => void>();
    const recording = await startRealtimeVoiceRecording({ chunkIntervalMillis: 250, onPcmChunk });
    for (let i = 0; i < 4; i++)
      processor.onaudioprocess!({
        inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) },
      });
    await recording.stop();
    recording.cancel();
    expect(recording.getOutputSampleCount()).toBeGreaterThan(4800);
    expect(
      onPcmChunk.mock.calls.reduce((size, [bytes]) => size + bytes.length, 0),
    ).toBe(recording.getOutputSampleCount() * 2);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
    expect(processor.onaudioprocess).toBeNull();
  });
  test('disconnect failure does not strand the microphone or context', async () => {
    const { track, processor, gain, context } = environment();
    processor.disconnect.mockImplementation(() => {
      throw new Error('already disconnected');
    });
    const recording = await startRealtimeVoiceRecording({
      chunkIntervalMillis: 250,
      onPcmChunk: vi.fn(),
    });
    recording.cancel();
    recording.cancel();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
