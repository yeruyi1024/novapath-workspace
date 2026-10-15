import { app, type BrowserWindow, ipcMain } from 'electron';

import type { GatewayAsrRequest } from '../../../shared/asr/gateway';
import { LocalAsrIpc } from '../../../shared/asr/local';
import { createLocalModelInstaller } from './localModel';
import { createLocalAsrRuntimeResolver } from './localRuntime';
import { createLocalTranscriptionService } from './localTranscription';

export function registerLocalAsrHandlers(getWindow: () => BrowserWindow | null): void {
  const service = createLocalTranscriptionService({ getRuntime: createLocalAsrRuntimeResolver({
    packaged: app.isPackaged, resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(), userDataPath: app.getPath('userData'), platform: process.platform, arch: process.arch,
  }) });
  const installer = createLocalModelInstaller({ userDataPath: app.getPath('userData'), progress: (owner, progress) => {
    const window = getWindow();
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.id === owner) {
      window.webContents.send(LocalAsrIpc.Progress, progress);
    }
  } });
  const observed = new WeakSet<Electron.WebContents>();
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    const window = getWindow();
    return !!window && !window.isDestroyed() && event.sender === window.webContents
      && event.senderFrame === window.webContents.mainFrame;
  };
  ipcMain.handle(LocalAsrIpc.Status, event => trusted(event) ? service.status() : { success: false, error: 'failed' });
  const observe = (sender: Electron.WebContents) => {
    if (observed.has(sender)) return;
    observed.add(sender);
    const stop = () => { service.cancel(sender.id); installer.cancel(sender.id); };
    sender.once('destroyed', stop);
    sender.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) stop(); });
  };
  ipcMain.handle(LocalAsrIpc.Transcribe, (event, input: GatewayAsrRequest) => {
    if (!trusted(event)) return { success: false, error: 'failed' };
    observe(event.sender);
    return service.transcribe(event.sender.id, input);
  });
  ipcMain.handle(LocalAsrIpc.Cancel, (event, requestId: unknown) => {
    if (trusted(event) && typeof requestId === 'string') service.cancel(event.sender.id, requestId);
  });
  ipcMain.handle(LocalAsrIpc.Prepare, (event, requestId: unknown) => {
    if (!trusted(event)) return { success: false, error: 'failed' };
    observe(event.sender);
    return installer.prepare(event.sender.id, requestId);
  });
  ipcMain.handle(LocalAsrIpc.CancelPrepare, (event, requestId: unknown) => {
    if (trusted(event) && typeof requestId === 'string') installer.cancel(event.sender.id, requestId);
  });
  app.on('before-quit', () => { service.cancelAll(); installer.cancelAll(); });
}
