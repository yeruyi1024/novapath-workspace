import { Component, type ErrorInfo, type ReactNode } from 'react';

import { i18nService } from '../services/i18n';
import WindowTitleBar from './window/WindowTitleBar';

/** React renders asynchronously; a try/catch around root.render cannot catch it. */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const detail = `Render failed (${error.name}); component stack: ${info.componentStack ?? 'unavailable'}`;
    // Error messages may contain server responses or user data. Log structure only.
    console.error('[AppErrorBoundary]', detail);
    try { window.electron?.log?.fromRenderer?.('error', 'AppErrorBoundary', detail); } catch { /* best-effort */ }
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="h-screen flex flex-col bg-background text-foreground">
        {window.electron?.platform === 'win32' && window.electron.window && (
          <header className="draggable flex h-9 shrink-0 items-center justify-between border-b border-border pl-3">
            <span className="text-xs">{i18nService.t('productName')}</span>
            <WindowTitleBar inline />
          </header>
        )}
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-semibold">{i18nService.t('appRenderFailed')}</h1>
            <p className="mt-3 text-sm text-secondary">{i18nService.t('appRenderFailedHint')}</p>
            <button type="button" onClick={() => window.location.reload()}
              className="mt-6 rounded-lg border border-border bg-surface px-5 py-2 text-sm hover:bg-surface-raised">
              {i18nService.t('retry')}
            </button>
          </div>
        </main>
      </div>
    );
  }
}
