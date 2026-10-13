import {
  GATEWAY_AUDIO_MAX_BYTES,
  GATEWAY_RECORDING_MAX_MS,
  type GatewayAsrRequest,
  type GatewayAsrResult,
} from '../../../shared/asr/gateway';
import type { RealtimeVoiceRecordingSession } from './realtimeAudioRecorder';
import { buildPcm16WavHeader } from './wavEncoder';

export type GatewayVoicePhase = 'idle' | 'starting' | 'recording' | 'recognizing';
export type GatewayVoiceError =
  'microphone' | 'audio' | Extract<GatewayAsrResult, { success: false }>['error'];
interface Dependencies {
  record: (onChunk: (chunk: Uint8Array) => void) => Promise<RealtimeVoiceRecordingSession>;
  transcribe: (input: GatewayAsrRequest) => Promise<GatewayAsrResult>;
  cancelRequest: (requestId: string) => void;
  onPhase: (phase: GatewayVoicePhase) => void;
  onError: (error: GatewayVoiceError) => void;
  onTranscript: (text: string) => void;
  createRequestId: () => string;
}

// Owns asynchronous microphone startup, cancellation and late IPC results.
export class GatewayVoiceSession {
  private generation = 0;
  private phase: GatewayVoicePhase = 'idle';
  private recording: RealtimeVoiceRecordingSession | null = null;
  private chunks: Uint8Array[] = [];
  private bytes = 0;
  private requestId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly deps: Dependencies) {}
  private setPhase(phase: GatewayVoicePhase) {
    this.phase = phase;
    this.deps.onPhase(phase);
  }
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  cancel() {
    this.generation += 1;
    this.clearTimer();
    this.recording?.cancel();
    this.recording = null;
    if (this.requestId) this.deps.cancelRequest(this.requestId);
    this.requestId = null;
    this.chunks = [];
    this.bytes = 0;
    this.setPhase('idle');
  }
  async start() {
    if (this.phase !== 'idle') return;
    const generation = ++this.generation;
    this.chunks = [];
    this.bytes = 0;
    this.setPhase('starting');
    try {
      const recording = await this.deps.record(chunk => {
        if (generation !== this.generation) return;
        if (this.bytes + chunk.byteLength + 44 > GATEWAY_AUDIO_MAX_BYTES) {
          this.cancel();
          this.deps.onError('audio');
          return;
        }
        this.chunks.push(chunk);
        this.bytes += chunk.byteLength;
      });
      if (generation !== this.generation) {
        recording.cancel();
        return;
      }
      this.recording = recording;
      this.setPhase('recording');
      this.timer = setTimeout(() => {
        void this.stop();
      }, GATEWAY_RECORDING_MAX_MS);
    } catch {
      if (generation !== this.generation) return;
      this.setPhase('idle');
      this.deps.onError('microphone');
    }
  }
  async stop() {
    if (this.phase !== 'recording' || !this.recording) return;
    const generation = this.generation;
    const recording = this.recording;
    this.clearTimer();
    this.setPhase('recognizing');
    try {
      await recording.stop();
      if (generation !== this.generation) return;
      this.recording = null;
      if (this.bytes < 9600) {
        this.deps.onError('audio');
        return;
      }
      const audio = new Uint8Array(44 + this.bytes);
      audio.set(buildPcm16WavHeader(16000, this.bytes));
      let offset = 44;
      for (const chunk of this.chunks) {
        audio.set(chunk, offset);
        offset += chunk.byteLength;
      }
      this.chunks = [];
      this.bytes = 0;
      this.requestId = this.deps.createRequestId();
      const result = await this.deps.transcribe({ requestId: this.requestId, audio });
      if (generation !== this.generation) return;
      if (result.success) this.deps.onTranscript(result.text);
      else if (result.error !== 'cancelled') this.deps.onError(result.error);
    } catch {
      if (generation === this.generation) this.deps.onError(this.requestId ? 'network' : 'audio');
    } finally {
      if (generation === this.generation) {
        this.recording?.cancel();
        this.recording = null;
        this.chunks = [];
        this.bytes = 0;
        this.requestId = null;
        this.setPhase('idle');
      }
    }
  }
}
