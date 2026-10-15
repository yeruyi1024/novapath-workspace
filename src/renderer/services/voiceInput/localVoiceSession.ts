import type { GatewayAsrStatus } from '../../../shared/asr/gateway';
import { type GatewayVoicePhase,GatewayVoiceSession } from './gatewayVoiceSession';

type Dependencies = ConstructorParameters<typeof GatewayVoiceSession>[0] & {
  status: () => Promise<GatewayAsrStatus>;
  onChecking: (checking: boolean) => void;
};

// A click starts dictation after readiness; another click finishes it.
// Readiness checks belong to the same cancellation generation as the recorder.
export class LocalVoiceSession {
  private generation = 0;
  private checking = false;
  private phase: GatewayVoicePhase = 'idle';
  private readonly recording: GatewayVoiceSession;
  constructor(private readonly deps: Dependencies) {
    this.recording = new GatewayVoiceSession({ ...deps, onPhase: phase => {
      this.phase = phase;
      deps.onPhase(phase);
    } });
  }
  async toggle() {
    if (this.phase === 'recording') return this.recording.stop();
    if (this.checking || this.phase !== 'idle') return;
    const generation = ++this.generation;
    this.checking = true;
    this.deps.onChecking(true);
    try {
      const status = await this.deps.status();
      if (generation !== this.generation) return;
      this.checking = false;
      this.deps.onChecking(false);
      if (status.success) await this.recording.start();
      else this.deps.onError(status.error);
    } catch {
      if (generation === this.generation) this.deps.onError('resources');
    } finally {
      if (generation === this.generation && this.checking) {
        this.checking = false;
        this.deps.onChecking(false);
      }
    }
  }
  cancel() {
    this.generation += 1;
    this.checking = false;
    this.deps.onChecking(false);
    this.recording.cancel();
  }
}
