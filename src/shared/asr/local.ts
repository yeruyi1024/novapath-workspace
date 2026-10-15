// Voice payload/result contracts are shared with the retained platform adapter.
export const LocalAsrIpc = {
  Status: 'asr:local:status',
  Transcribe: 'asr:local:transcribe',
  Cancel: 'asr:local:cancel',
  Prepare: 'asr:local:prepare',
  CancelPrepare: 'asr:local:cancelPrepare',
  Progress: 'asr:local:progress',
} as const;

export interface LocalAsrProgress { requestId: string; received: number; total: number; verifying: boolean }
