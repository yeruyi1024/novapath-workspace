import { type BrowserWindow, ipcMain } from 'electron';

import { GatewayAsrIpc, type GatewayAsrRequest } from '../../../shared/asr/gateway';
import {
  createGatewayTranscriptionService,
  type GatewaySpeechConfig,
} from './gatewayTranscription';

export function registerGatewayAsrHandlers(
  getWindow: () => BrowserWindow | null,
  getConfig: () => GatewaySpeechConfig | null,
): void {
  const service = createGatewayTranscriptionService({ getConfig });
  const observed = new WeakSet<Electron.WebContents>();
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    const window = getWindow();
    return (
      !!window &&
      !window.isDestroyed() &&
      event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame
    );
  };
  ipcMain.handle(GatewayAsrIpc.Status, event =>
    trusted(event) ? service.status() : { success: false, error: 'platform' },
  );
  ipcMain.handle(GatewayAsrIpc.Transcribe, (event, input: GatewayAsrRequest) => {
    if (!trusted(event)) return { success: false, error: 'platform' };
    const owner = event.sender.id;
    if (!observed.has(event.sender)) {
      observed.add(event.sender);
      event.sender.once('destroyed', () => service.cancel(owner));
      event.sender.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
        if (isMainFrame) service.cancel(owner);
      });
    }
    return service.transcribe(owner, input);
  });
  ipcMain.handle(GatewayAsrIpc.Cancel, (event, requestId: unknown) => {
    if (trusted(event) && typeof requestId === 'string') service.cancel(event.sender.id, requestId);
  });
}
