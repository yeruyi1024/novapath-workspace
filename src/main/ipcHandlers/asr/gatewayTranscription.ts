import {
  GATEWAY_AUDIO_MAX_BYTES,
  type GatewayAsrRequest,
  type GatewayAsrResult,
  type GatewayAsrStatus,
} from '../../../shared/asr/gateway';

export interface GatewaySpeechConfig {
  baseURL: string;
  apiKey: string;
  modelIds: string[];
}
interface Dependencies {
  getConfig: () => GatewaySpeechConfig | null;
  fetch?: typeof fetch;
}

// Use only models that implement the OpenAI-compatible transcription endpoint.
export function selectTranscriptionModel(ids: string[]): string | undefined {
  const candidates = ids.filter(id =>
    /^(whisper(?:-1|-large-v3(?:-turbo)?)?|gpt-4o(?:-mini)?-transcribe(?:-\d{4}-\d{2}-\d{2})?)$/.test(
      id,
    ),
  );
  return candidates.find(id => id === 'whisper-1') ?? candidates[0];
}

function endpoint(config: GatewaySpeechConfig, suffix: string): string {
  const url = new URL(config.baseURL);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !config.apiKey.trim()
  )
    throw new Error('platform');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${suffix}`;
  return url.toString();
}

export function isValidVoiceWav(audio: unknown): audio is Uint8Array {
  if (
    !(audio instanceof Uint8Array) ||
    audio.byteLength < 44 + 9600 ||
    audio.byteLength > GATEWAY_AUDIO_MAX_BYTES
  )
    return false;
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const tag = (offset: number, value: string) =>
    [...value].every((c, i) => view.getUint8(offset + i) === c.charCodeAt(0));
  return (
    tag(0, 'RIFF') &&
    tag(8, 'WAVE') &&
    tag(12, 'fmt ') &&
    tag(36, 'data') &&
    view.getUint32(4, true) === audio.byteLength - 8 &&
    view.getUint32(16, true) === 16 &&
    view.getUint16(20, true) === 1 &&
    view.getUint16(22, true) === 1 &&
    view.getUint32(24, true) === 16000 &&
    view.getUint32(28, true) === 32000 &&
    view.getUint16(32, true) === 2 &&
    view.getUint16(34, true) === 16 &&
    view.getUint32(40, true) === audio.byteLength - 44 &&
    (audio.byteLength - 44) % 2 === 0
  );
}

async function readJson(response: Response): Promise<unknown> {
  // Never return upstream bodies or errors to the renderer: these can echo credentials.
  if (Number(response.headers.get('content-length')) > 1024 * 1024) throw new Error('response');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('response');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error('response');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch((): undefined => undefined);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export function createGatewayTranscriptionService({
  getConfig,
  fetch: request = fetch,
}: Dependencies) {
  const active = new Map<number, { requestId: string; controller: AbortController }>();
  const getModel = async (
    config: GatewaySpeechConfig,
    signal: AbortSignal,
  ): Promise<string | undefined> => {
    const cached = selectTranscriptionModel(config.modelIds);
    if (cached) return cached;
    const response = await request(endpoint(config, 'models'), {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal,
      redirect: 'error',
    });
    if (!response.ok)
      throw new Error(response.status === 401 || response.status === 403 ? 'auth' : 'network');
    const body = (await readJson(response)) as { data?: { id?: unknown }[] };
    if (!Array.isArray(body?.data)) throw new Error('network');
    return selectTranscriptionModel(
      body.data.flatMap(model => (typeof model?.id === 'string' ? [model.id] : [])),
    );
  };
  const safeConfig = (): GatewaySpeechConfig | null => {
    try {
      return getConfig();
    } catch {
      return null;
    }
  };
  const status = async (): Promise<GatewayAsrStatus> => {
    const config = safeConfig();
    if (!config) return { success: false, error: 'platform' };
    try {
      endpoint(config, 'models');
      const model = await getModel(config, AbortSignal.timeout(10_000));
      return model ? { success: true, model } : { success: false, error: 'model' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error && error.message === 'auth' ? 'auth' : 'network',
      };
    }
  };
  const cancel = (owner: number, requestId?: string): void => {
    const job = active.get(owner);
    if (job && (!requestId || job.requestId === requestId)) job.controller.abort();
  };
  const transcribe = async (owner: number, input: GatewayAsrRequest): Promise<GatewayAsrResult> => {
    if (
      !input ||
      typeof input.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(input.requestId) ||
      !isValidVoiceWav(input.audio)
    )
      return { success: false, error: 'audio' };
    if (active.has(owner)) return { success: false, error: 'busy' };
    const config = safeConfig();
    if (!config) return { success: false, error: 'platform' };
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]);
    active.set(owner, { requestId: input.requestId, controller });
    try {
      const model = await getModel(config, signal);
      if (!model) return { success: false, error: 'model' };
      const form = new FormData();
      form.set('model', model);
      form.set('response_format', 'json');
      form.set(
        'file',
        new Blob([new Uint8Array(input.audio)], { type: 'audio/wav' }),
        'recording.wav',
      );
      const response = await request(endpoint(config, 'audio/transcriptions'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal,
        redirect: 'error',
      });
      if (controller.signal.aborted) return { success: false, error: 'cancelled' };
      if (!response.ok) {
        return {
          success: false,
          error:
            response.status === 401 || response.status === 403
              ? 'auth'
              : response.status === 429 || response.status === 402
                ? 'quota'
                : response.status === 404
                  ? 'model'
                  : 'failed',
        };
      }
      const body = (await readJson(response)) as { text?: unknown };
      if (controller.signal.aborted) return { success: false, error: 'cancelled' };
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
      return text ? { success: true, text } : { success: false, error: 'empty' };
    } catch (error) {
      return {
        success: false,
        error: controller.signal.aborted
          ? 'cancelled'
          : signal.aborted
            ? 'timeout'
            : error instanceof Error && error.message === 'auth'
              ? 'auth'
              : 'network',
      };
    } finally {
      active.delete(owner);
    }
  };
  return { status, transcribe, cancel };
}
