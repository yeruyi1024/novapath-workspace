import { Component, type ReactNode } from 'react';

import { i18nService } from '../../services/i18n';

interface PreviewErrorBoundaryProps {
  children: ReactNode;
  resetKey?: string;
}

interface PreviewErrorBoundaryState {
  failed: boolean;
  resetKey?: string;
}

/** File renderers and lazy editors must never take down the conversation shell. */
export default class PreviewErrorBoundary extends Component<PreviewErrorBoundaryProps, PreviewErrorBoundaryState> {
  state: PreviewErrorBoundaryState = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(
    props: PreviewErrorBoundaryProps,
    state: PreviewErrorBoundaryState,
  ): PreviewErrorBoundaryState | null {
    return props.resetKey !== state.resetKey
      ? { failed: false, resetKey: props.resetKey }
      : null;
  }

  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(error: Error): void {
    // Do not include paths, contents, or upstream response messages in diagnostics.
    console.error('[PreviewErrorBoundary] render failed:', error.name);
  }
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <h2 className="text-sm font-medium text-foreground">{i18nService.t('previewRenderFailed')}</h2>
        <p className="max-w-sm text-sm text-secondary">{i18nService.t('previewRenderFailedHint')}</p>
      </div>
    );
  }
}
