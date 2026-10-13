export const GatewayAsrIpc = {
  Status: 'asr:gateway:status',
  Transcribe: 'asr:gateway:transcribe',
  Cancel: 'asr:gateway:cancel',
} as const;

export const GATEWAY_RECORDING_MAX_MS = 60_000;
export const GATEWAY_AUDIO_MAX_BYTES = 44 + 16_000 * 2 * 61;
export type GatewayAsrError =
  | 'platform'
  | 'model'
  | 'resources'
  | 'audio'
  | 'busy'
  | 'auth'
  | 'quota'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'empty'
  | 'failed';
export type GatewayAsrStatus =
  { success: true; model: string } | { success: false; error: GatewayAsrError };
export interface GatewayAsrRequest {
  requestId: string;
  audio: Uint8Array;
}
export type GatewayAsrResult =
  { success: true; text: string } | { success: false; error: GatewayAsrError };
