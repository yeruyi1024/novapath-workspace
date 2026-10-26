import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';

import { configService } from '../../services/config';
import { i18nService } from '../../services/i18n';
import { refreshMaasAccount, refreshMaasBilling, useMaasSession } from '../../services/maasAccount';
import { MaasSessionPhase } from '../../services/maasSession';
import { createManagedModelRefresh } from '../../services/managedModelRefresh';
import { clearManagedPlatformKey, hasActivePlatformConversation, managedModelSyncContext, syncManagedPlatformKey } from '../../services/managedPlatformKey';
import { themeService } from '../../services/theme';
import { type RootState,store } from '../../store';
import WorkspaceLoadingScreen from '../common/WorkspaceLoadingScreen';
import WelcomeDialog from '../WelcomeDialog';
import WindowsAppTitleBar from '../window/WindowsAppTitleBar';

export default function PlatformSessionGate({ children }: { children: ReactNode }) {
  const session = useMaasSession();
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [accountRefreshRevision, setAccountRefreshRevision] = useState(0);
  const modelRefresh = useRef<ReturnType<typeof createManagedModelRefresh>>();
  const conversationActive = useSelector((state: RootState) => hasActivePlatformConversation(state.cowork));
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  useEffect(() => {
    let current = true;
    const timeout = window.setTimeout(() => {
      if (current) setPreferencesReady(true);
    }, 16_000);
    void configService.init().then(async () => {
      if (!current) return;
      themeService.initialize();
      await i18nService.initialize();
    }).catch(error => console.warn('[PlatformSessionGate] Failed to load appearance preferences:', error))
      .finally(() => { window.clearTimeout(timeout); if (current) setPreferencesReady(true); });
    return () => { current = false; window.clearTimeout(timeout); };
  }, []);
  const accountId = session.snapshot.account?.id;
  const modelContext = managedModelSyncContext(session.snapshot.origin, accountId, session.snapshot.account?.group);
  useEffect(() => {
    const scheduler = createManagedModelRefresh((id, isCurrent) => syncManagedPlatformKey(id, {
      fetchManagedKey: account => window.electron.maas.managedKey(account),
      getConfig: () => configService.getConfig(),
      updateConfig: update => configService.updateConfig(update),
      fetchApi: window.electron.api.fetch,
      isCurrent,
      refreshModels: true,
      canWriteConfig: () => !hasActivePlatformConversation(store.getState().cowork),
    }), error => console.warn('[PlatformSessionGate] Managed model refresh failed:', error));
    modelRefresh.current = scheduler;
    return () => { scheduler.dispose(); modelRefresh.current = undefined; };
  }, []);
  useEffect(() => {
    if (!preferencesReady) return;
    modelRefresh.current?.update(session.phase === MaasSessionPhase.SignedIn && accountId
      ? { key: modelContext, accountId, busy: conversationActive, revision: accountRefreshRevision }
      : null);
  }, [preferencesReady, session.phase, accountId, modelContext, conversationActive, accountRefreshRevision]);
  useEffect(() => {
    if (preferencesReady && session.phase === MaasSessionPhase.SignedOut) {
      void clearManagedPlatformKey({ getConfig: () => configService.getConfig(), updateConfig: update => configService.updateConfig(update) })
        .catch(error => console.warn('[PlatformSessionGate] Managed key cleanup failed:', error));
    }
  }, [preferencesReady, session.phase]);
  useEffect(() => {
    if (session.phase !== MaasSessionPhase.SignedIn) return;
    let active = true;
    let checkInFlight = false;
    let lastCheck = 0;
    const check = () => {
      const now = Date.now();
      if (document.hidden || checkInFlight || now - lastCheck < 5_000) return;
      lastCheck = now;
      checkInFlight = true;
      void refreshMaasAccount().then(() => {
        if (!active) return;
        // Recheck even when the account's group name is unchanged: global
        // managed-key policy and models within the same group can change.
        setAccountRefreshRevision(revision => revision + 1);
        return refreshMaasBilling();
      }).finally(() => { checkInFlight = false; });
    };
    void refreshMaasBilling();
    const timer = window.setInterval(check, 5 * 60_000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const completeCleanup = window.electron.cowork.onStreamComplete(() => { void refreshMaasBilling(); });
    const errorCleanup = window.electron.cowork.onStreamError(() => { void refreshMaasBilling(); });
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
      completeCleanup();
      errorCleanup();
    };
  }, [session.phase, session.snapshot.account?.id]);

  if (!preferencesReady || session.phase === MaasSessionPhase.Checking) return <WorkspaceLoadingScreen label={i18nService.t('engineStartingWorkspace')} />;
  if (session.phase === MaasSessionPhase.SignedIn) return children;
  return <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
    {window.electron.platform === 'win32' && <WindowsAppTitleBar searchLabel={i18nService.t('search')} />}
    <WelcomeDialog
      origin={session.snapshot.origin}
      error={session.logoutRemoteFailed ? i18nService.t('maasLogoutOffline') : session.error ? i18nService.t(`maasError_${session.error}`) : undefined}
      onRetry={() => { void refreshMaasAccount(); }}
    />
  </div>;
}
