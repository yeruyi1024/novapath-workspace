import './engineStartup.css';

import React, { useEffect, useState } from 'react';

import { OpenClawEnginePhase } from '../../../shared/openclawEngine/constants';
import { coworkService } from '../../services/cowork';
import { i18nService } from '../../services/i18n';
import type { OpenClawEngineStatus } from '../../types/cowork';
import WorkspaceLoadingScreen from '../common/WorkspaceLoadingScreen';

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

  return <WorkspaceLoadingScreen
    label={i18nService.t(status?.phase === OpenClawEnginePhase.Starting ? 'engineStartingAssistant' : 'engineStartingWorkspace')}
    showSlowHint={showSlowHint}
  />;
};

export default EngineStartupOverlay;
