import { describe, expect, test, vi } from 'vitest';

import type { GatewayAsrStatus } from '../../../shared/asr/gateway';
import { LocalVoiceSession } from './localVoiceSession';

function fixture() {
  const recording = { stop: vi.fn(async () => undefined), cancel: vi.fn(), getOutputSampleCount: () => 8000 };
  const deps = {
    status: vi.fn(async (): Promise<GatewayAsrStatus> => ({ success: true, model: 'local-test' })),
    record: vi.fn(async (onChunk: (chunk: Uint8Array) => void) => { onChunk(new Uint8Array(16000)); return recording; }),
    transcribe: vi.fn(async () => ({ success: true as const, text: 'spoken text' })),
    cancelRequest: vi.fn(), createRequestId: () => 'request-test',
    onPhase: vi.fn(), onError: vi.fn(), onTranscript: vi.fn(), onChecking: vi.fn(),
  };
  return { deps, recording, session: new LocalVoiceSession(deps) };
}
describe('direct local dictation', () => {
  test('one click opens the microphone; another finishes and delivers text without sending', async () => {
    const { session, deps, recording } = fixture();
    await session.toggle();
    expect(deps.record).toHaveBeenCalledOnce();
    expect(deps.onPhase).toHaveBeenLastCalledWith('recording');
    expect(deps.transcribe).not.toHaveBeenCalled();
    await session.toggle();
    expect(recording.stop).toHaveBeenCalledOnce();
    expect(deps.onTranscript).toHaveBeenCalledExactlyOnceWith('spoken text');
    expect(deps.onPhase).toHaveBeenLastCalledWith('idle');
  });
  test('rapid clicks while readiness is pending open only one microphone', async () => {
    const { session, deps } = fixture();
    let ready!: (status: GatewayAsrStatus) => void;
    deps.status.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const first = session.toggle();
    await session.toggle();
    expect(deps.status).toHaveBeenCalledOnce();
    ready({ success: true, model: 'local-test' });
    await first;
    expect(deps.record).toHaveBeenCalledOnce();
    session.cancel();
  });
  test('cancelling a readiness check discards its late result', async () => {
    const { session, deps } = fixture();
    let ready!: (status: GatewayAsrStatus) => void;
    deps.status.mockImplementation(() => new Promise(resolve => { ready = resolve; }));
    const first = session.toggle();
    session.cancel();
    ready({ success: true, model: 'local-test' });
    await first;
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.onChecking).toHaveBeenLastCalledWith(false);
  });
  test('an old readiness response cannot cancel or start the next recording', async () => {
    const { session, deps } = fixture();
    let ready!: (status: GatewayAsrStatus) => void;
    deps.status.mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }));
    const first = session.toggle();
    session.cancel();
    await session.toggle();
    ready({ success: false, error: 'resources' });
    await first;
    expect(deps.record).toHaveBeenCalledOnce();
    expect(deps.onError).not.toHaveBeenCalled();
    expect(deps.onPhase).toHaveBeenLastCalledWith('recording');
    session.cancel();
  });
  test('missing speech pack requests preparation without opening the microphone; next click can retry', async () => {
    const { session, deps } = fixture();
    deps.status.mockResolvedValueOnce({ success: false, error: 'model' });
    await session.toggle();
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.onError).toHaveBeenCalledExactlyOnceWith('model');
    await session.toggle();
    expect(deps.record).toHaveBeenCalledOnce();
    session.cancel();
  });
  test('readiness failure releases the checking state and permits retry', async () => {
    const { session, deps } = fixture();
    deps.status.mockRejectedValueOnce(new Error('unavailable'));
    await session.toggle();
    expect(deps.onError).toHaveBeenCalledExactlyOnceWith('resources');
    expect(deps.onChecking).toHaveBeenLastCalledWith(false);
    await session.toggle();
    expect(deps.record).toHaveBeenCalledOnce();
    session.cancel();
  });
});
