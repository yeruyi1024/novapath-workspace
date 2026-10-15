import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState } from 'react';

import type { LocalAsrProgress } from '../../../../shared/asr/local';
import runtimeManifest from '../../../../shared/asr/local-runtime.json';
import { i18nService } from '../../../services/i18n';
import { type GatewayVoiceError, type GatewayVoicePhase } from '../../../services/voiceInput/gatewayVoiceSession';
import { LocalVoiceSession } from '../../../services/voiceInput/localVoiceSession';
import { startRealtimeVoiceRecording } from '../../../services/voiceInput/realtimeAudioRecorder';
import MicrophoneIcon from '../../icons/MicrophoneIcon';
import LocalVoiceInputActions from './LocalVoiceInputActions';

interface Props {
  disabled: boolean;
  buttonClassName: string;
  iconClassName: string;
  onTranscript: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
}

export default function LocalVoiceInputButton({ disabled, buttonClassName, iconClassName, onTranscript, onBusyChange }: Props) {
  const [phase, setPhase] = useState<GatewayVoicePhase>('idle');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<GatewayVoiceError | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [download, setDownload] = useState<LocalAsrProgress | null>(null);
  const prepareRequest = useRef<string | null>(null);
  const prepareGeneration = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const transcriptRef = useRef(onTranscript);
  transcriptRef.current = onTranscript;
  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;
  const resetRef = useRef<() => void>(() => undefined);
  const sessionRef = useRef<LocalVoiceSession | null>(null);
  if (!sessionRef.current) {
    sessionRef.current = new LocalVoiceSession({
      status: () => window.electron.asr.localStatus(),
      onChecking: next => { if (mounted.current) setChecking(next); },
      record: onPcmChunk => startRealtimeVoiceRecording({ chunkIntervalMillis: 250, onPcmChunk }),
      transcribe: input => window.electron.asr.transcribeLocal(input),
      cancelRequest: requestId => { void window.electron.asr.cancelLocal(requestId).catch(() => undefined); },
      createRequestId: () => crypto.randomUUID(),
      onPhase: next => { if (mounted.current) setPhase(next); },
      onError: next => { if (mounted.current) setError(next === 'network' ? 'failed' : next); },
      onTranscript: text => {
        if (!mounted.current) return;
        transcriptRef.current(text);
        resetRef.current();
      },
    });
  }
  const session = sessionRef.current;
  const reset = () => {
    prepareGeneration.current += 1;
    session.cancel();
    if (prepareRequest.current) void window.electron.asr.cancelLocalPrepare(prepareRequest.current).catch(() => undefined);
    prepareRequest.current = null;
    setPreparing(false);
    setDownload(null);
    setError(null);
    busyRef.current(false);
  };
  resetRef.current = reset;
  const busy = checking || phase !== 'idle' || preparing;
  const visible = busy || error !== null;
  useEffect(() => { busyRef.current(busy); }, [busy]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      prepareGeneration.current += 1;
      session.cancel();
      if (prepareRequest.current) void window.electron.asr.cancelLocalPrepare(prepareRequest.current).catch(() => undefined);
      prepareRequest.current = null;
      busyRef.current(false);
    };
  }, [session]);
  useEffect(() => window.electron.asr.onLocalProgress(progress => {
    if (mounted.current && prepareRequest.current === progress.requestId) setDownload(progress);
  }), []);
  useEffect(() => { if (disabled) resetRef.current(); }, [disabled]);
  useEffect(() => {
    if (!visible) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[data-app-modal]')) return;
      event.preventDefault();
      resetRef.current();
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, [visible]);
  useEffect(() => {
    if (phase !== 'recording') return;
    setSeconds(0);
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.min(60, Math.floor((Date.now() - startedAt) / 1000))), 250);
    return () => clearInterval(timer);
  }, [phase]);

  const prepareLocal = async () => {
    if (prepareRequest.current) return;
    const requestId = crypto.randomUUID();
    const generation = ++prepareGeneration.current;
    prepareRequest.current = requestId;
    setPreparing(true);
    setError(null);
    setDownload({ requestId, received: 0, total: runtimeManifest.model.bytes, verifying: false });
    try {
      const result = await window.electron.asr.prepareLocal(requestId);
      if (!mounted.current || generation !== prepareGeneration.current) return;
      if (!result.success) { setError(result.error); return; }
      const ready = await window.electron.asr.localStatus();
      if (!mounted.current || generation !== prepareGeneration.current) return;
      // A download can take minutes: finishing it must not open the microphone unexpectedly.
      if (ready.success) resetRef.current();
      else setError(ready.error);
    } catch {
      if (mounted.current && generation === prepareGeneration.current) setError('network');
    } finally {
      if (prepareRequest.current === requestId) {
        prepareRequest.current = null;
        if (mounted.current) setPreparing(false);
      }
    }
  };
  const clickVoice = () => {
    if (disabled || preparing) return;
    setError(null);
    void session.toggle();
  };
  const label = i18nService.t(phase === 'recording' ? 'gatewayVoiceStop' : phase === 'recognizing'
    ? 'gatewayVoiceRecognizing' : checking || phase === 'starting' ? 'gatewayVoiceStarting' : 'gatewayVoiceTitle');
  return (
    <div className="relative flex shrink-0 items-center">
      <button ref={buttonRef} type="button" disabled={disabled || preparing || checking || phase === 'starting' || phase === 'recognizing'}
        onClick={clickVoice} title={label} aria-label={label} aria-pressed={phase === 'recording'}
        className={`${buttonClassName} ${phase === 'recording' ? 'bg-primary/10 text-primary' : 'text-secondary'} transition-colors hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40`}>
        {checking || preparing || phase === 'starting' || phase === 'recognizing'
          ? <ArrowPathIcon aria-hidden="true" className={`${iconClassName} animate-spin motion-reduce:animate-none`} />
          : phase === 'recording' ? <span className="h-[34%] w-[34%] rounded-[3px] bg-current" aria-hidden="true" />
          : <MicrophoneIcon className={iconClassName} />}
      </button>
      {visible && (
        <div role="status" aria-live="polite" className="absolute bottom-full right-0 z-30 mb-3 w-72 max-w-[calc(100vw-48px)] rounded-2xl border border-border bg-surface p-3 text-sm text-foreground shadow-lg">
          {preparing ? (
            <>
              <p>{i18nService.t(download?.verifying ? 'localVoiceVerifying' : 'localVoiceDownloading')}
                {!download?.verifying && ` ${Math.min(99, Math.floor((download?.received ?? 0) / runtimeManifest.model.bytes * 100))}%`}</p>
              <progress aria-label={i18nService.t('localVoiceDownloading')} max={runtimeManifest.model.bytes}
                value={download?.received ?? 0} className="mt-2 h-1.5 w-full accent-primary" />
            </>
          ) : error ? (
            <p role="alert" className="leading-5 text-secondary">{i18nService.t(['resources', 'model', 'failed', 'network'].includes(error)
              ? `localVoiceError_${error}` : `gatewayVoiceError_${error}`)
              .replace('{size}', String(Math.round(runtimeManifest.model.bytes / 1_000_000)))}</p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {phase === 'recording' && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
                {i18nService.t(checking ? 'localVoiceChecking' : phase === 'recording' ? 'gatewayVoiceRecording'
                  : phase === 'recognizing' ? 'gatewayVoiceRecognizing' : 'gatewayVoiceStarting')}
              </span>
              {phase === 'recording' && <span className="text-xs tabular-nums text-secondary">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')} / 01:00</span>}
            </div>
          )}
          <div className="mt-2 flex items-center justify-end gap-2">
            <LocalVoiceInputActions phase={phase} hasError={Boolean(error && !preparing)}
              onCancel={() => { reset(); buttonRef.current?.focus(); }} onFinish={clickVoice} />
            {(error === 'model' || error === 'network') && !preparing && <button type="button" onClick={() => { void prepareLocal(); }}
              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              {i18nService.t('localVoiceDownload')}
            </button>}
          </div>
        </div>
      )}
    </div>
  );
}
