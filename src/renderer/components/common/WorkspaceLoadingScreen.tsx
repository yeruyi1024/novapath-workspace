import '../cowork/engineStartup.css';

import { i18nService } from '../../services/i18n';
import WindowsAppTitleBar from '../window/WindowsAppTitleBar';

interface Props {
  label: string;
  showSlowHint?: boolean;
}

export default function WorkspaceLoadingScreen({ label, showSlowHint = false }: Props) {
  return (
    <div className="starpath-startup" role="status" aria-live="polite" aria-busy="true">
      {typeof window !== 'undefined' && window.electron?.platform === 'win32' && <div className="starpath-startup-titlebar">
        <WindowsAppTitleBar isOverlayActive searchLabel={i18nService.t('search')} />
      </div>}
      <div className="starpath-startup-content">
        <div className="starpath-startup-brand">
          <img className="starpath-startup-logo" src="logo.svg" alt="" width={40} height={40} draggable={false} />
          <h1 className="starpath-startup-title">{i18nService.t('productName')}</h1>
        </div>
        <p className="starpath-startup-subtitle">{i18nService.t('starpathWorkspace')}</p>
        <div className="starpath-startup-status">
          <span className="starpath-startup-dots" aria-hidden="true">
            <span className="starpath-startup-dot" /><span className="starpath-startup-dot" /><span className="starpath-startup-dot" />
          </span>
          <span>{label}</span>
        </div>
        <p className="starpath-startup-slow" aria-hidden={!showSlowHint} style={{ visibility: showSlowHint ? 'visible' : 'hidden' }}>
          {i18nService.t('engineStartingSlowHint')}
        </p>
      </div>
    </div>
  );
}
