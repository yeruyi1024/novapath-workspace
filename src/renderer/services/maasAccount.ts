import { useEffect, useSyncExternalStore } from 'react';

import { type MaasResult, type MaasSnapshot } from '../../shared/auth/maas';
import { createMaasSessionStore, type MaasSessionState } from './maasSession';

const sessionStore = createMaasSessionStore(() => window.electron.maas.snapshot(), () => window.electron.maas.billing());

export function applyMaasResult(result: MaasResult): MaasResult {
  return sessionStore.apply(result);
}

export const refreshMaasAccount = sessionStore.refresh;
export const refreshMaasBilling = sessionStore.refreshBilling;

export function useMaasSession(): MaasSessionState {
  const state = useSyncExternalStore(sessionStore.subscribe, sessionStore.getState);
  useEffect(() => {
    sessionStore.initialize();
  }, []);
  return state;
}

export function useMaasAccount(): MaasSnapshot {
  return useMaasSession().snapshot;
}
