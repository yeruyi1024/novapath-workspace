import './engineStartup.css';

import React, { useEffect, useState } from 'react';

import { OpenClawEnginePhase } from '../../../shared/openclawEngine/constants';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import type { OpenClawEngineStatus } from '../../types/cowork';

const SLOW_HINT_AFTER_MS = 15000;

interface EngineStartupOverlayProps {
  bootstrapping?: boolean;
}

/** Shares layout and motion with index.html for a continuous bootstrap handoff. */
const EngineStartupOverlay: React.FC<EngineStartupOverlayProps> = ({ bootstrapping = false }) => {
  const [status, setStatus] = useState<OpenClawEngineStatus | null>(
    () => coworkService.getOpenClawEngineStatusSnapshot()
  );
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    coworkService.getOpenClawEngineStatus()
      .then(nextStatus => {
        if (nextStatus) setStatus(nextStatus);
      })
      .catch(() => { /* keep last known status */ });

    return coworkService.onOpenClawEngineStatus(setStatus);
  }, []);

  const visible = bootstrapping || status?.phase === OpenClawEnginePhase.Starting;

  useEffect(() => {
    if (!visible) {
      setShowSlowHint(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowHint(true), SLOW_HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="starpath-startup" role="status" aria-live="polite" aria-busy="true">
      <div className="starpath-startup-content">
        <div className="starpath-startup-brand">
          <img className="starpath-startup-logo" src="logo.svg" alt="" width={40} height={40} draggable={false} />
          <h1 className="starpath-startup-title">{i18nService.t('productName')}</h1>
        </div>
        <p className="starpath-startup-subtitle">{i18nService.t('starpathWorkspace')}</p>
        <div className="starpath-startup-status">
          <span className="starpath-startup-dots" aria-hidden="true">
            <span className="starpath-startup-dot" />
            <span className="starpath-startup-dot" />
            <span className="starpath-startup-dot" />
          </span>
          <span>{i18nService.t(status?.phase === OpenClawEnginePhase.Starting ? 'engineStartingAssistant' : 'engineStartingWorkspace')}</span>
        </div>
        <p className="starpath-startup-slow" aria-hidden={!showSlowHint} style={{ visibility: showSlowHint ? 'visible' : 'hidden' }}>
          {i18nService.t('engineStartingSlowHint')}
        </p>
      </div>
    </div>
  );
};

export default EngineStartupOverlay;
