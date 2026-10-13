import { afterEach, describe, expect, test, vi } from 'vitest';

import { GatewayVoiceSession } from './gatewayVoiceSession';
import type { RealtimeVoiceRecordingSession } from './realtimeAudioRecorder';

function setup() {
  const recording: RealtimeVoiceRecordingSession = {
    stop: vi.fn(async () => undefined),
    cancel: vi.fn(),
    getOutputSampleCount: () => 8000,
  };
  const record = vi.fn(async (onChunk: (bytes: Uint8Array) => void) => {
    onChunk(new Uint8Array(16000));
    return recording;
  });
  const deps = {
    record,
    transcribe: vi.fn(async () => ({ success: true as const, text: 'recognized' })),
    cancelRequest: vi.fn(),
    onPhase: vi.fn(),
    onError: vi.fn(),
    onTranscript: vi.fn(),
    createRequestId: () => 'request-1',
  };
  return { recording, deps, session: new GatewayVoiceSession(deps) };
}

afterEach(() => vi.useRealTimers());
describe('gateway voice lifecycle', () => {
  test('starts once, flushes recorder before upload, delivers text without submitting', async () => {
    const { session, deps, recording } = setup();
    await Promise.all([session.start(), session.start()]);
    expect(deps.record).toHaveBeenCalledOnce();
    await Promise.all([session.stop(), session.stop()]);
    expect(recording.stop).toHaveBeenCalledOnce();
    expect(deps.transcribe).toHaveBeenCalledOnce();
    expect(deps.transcribe.mock.invocationCallOrder[0]).toBeGreaterThan(
      (recording.stop as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0],
    );
    expect(deps.onTranscript).toHaveBeenCalledExactlyOnceWith('recognized');
    expect(deps.onPhase.mock.calls.map(call => call[0])).toEqual([
      'starting',
      'recording',
      'recognizing',
      'idle',
    ]);
  });
  test('cancel during permission prompt stops late recorder and never uploads', async () => {
    const { session, deps, recording } = setup();
    let ready!: (recording: RealtimeVoiceRecordingSession) => void;
    deps.record.mockImplementation(
      () =>
        new Promise(resolve => {
          ready = resolve;
        }),
    );
    const start = session.start();
    session.cancel();
    ready(recording);
    await start;
    expect(recording.cancel).toHaveBeenCalledOnce();
    expect(deps.transcribe).not.toHaveBeenCalled();
    expect(deps.onPhase).toHaveBeenLastCalledWith('idle');
  });
  test('switching draft or closing during transcription cancels request and ignores old result', async () => {
    const { session, deps } = setup();
    let complete!: (result: { success: true; text: string }) => void;
    deps.transcribe.mockImplementation(
      () =>
        new Promise(resolve => {
          complete = resolve;
        }),
    );
    await session.start();
    const stop = session.stop();
    await vi.waitFor(() => expect(deps.transcribe).toHaveBeenCalledOnce());
    session.cancel();
    complete({ success: true, text: 'late response' });
    await stop;
    expect(deps.cancelRequest).toHaveBeenCalledExactlyOnceWith('request-1');
    expect(deps.onTranscript).not.toHaveBeenCalled();
  });
  test('cancelling while recorder flushes cannot clear a newer recording', async () => {
    const { session, deps, recording } = setup();
    let flush!: () => void;
    vi.mocked(recording.stop).mockImplementation(
      () =>
        new Promise(resolve => {
          flush = resolve;
        }),
    );
    await session.start();
    const stop = session.stop();
    session.cancel();
    const newer = { ...recording, cancel: vi.fn() };
    deps.record.mockResolvedValue(newer);
    await session.start();
    flush();
    await stop;
    session.cancel();
    expect(newer.cancel).toHaveBeenCalledOnce();
    expect(deps.transcribe).not.toHaveBeenCalled();
  });
  test('microphone failure, short audio and network failure are visible and retryable', async () => {
    const { session, deps } = setup();
    deps.record.mockRejectedValueOnce(new Error('denied'));
    await session.start();
    expect(deps.onError).toHaveBeenLastCalledWith('microphone');
    deps.record.mockImplementationOnce(async () => ({
      stop: async () => undefined,
      cancel: vi.fn(),
      getOutputSampleCount: () => 0,
    }));
    await session.start();
    await session.stop();
    expect(deps.onError).toHaveBeenLastCalledWith('audio');
    expect(deps.transcribe).not.toHaveBeenCalled();
    deps.transcribe.mockRejectedValueOnce(new Error('network'));
    await session.start();
    await session.stop();
    expect(deps.onError).toHaveBeenLastCalledWith('network');
    await session.start();
    await session.stop();
    expect(deps.onTranscript).toHaveBeenCalledWith('recognized');
  });
  test('automatically stops at 60 seconds and cancellation clears automatic stop', async () => {
    vi.useFakeTimers();
    const { session, deps } = setup();
    await session.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.transcribe).toHaveBeenCalledOnce();
    await session.start();
    session.cancel();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.transcribe).toHaveBeenCalledOnce();
  });
});
