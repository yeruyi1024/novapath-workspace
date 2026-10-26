import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';

import { configService } from '../../services/config';
import { i18nService } from '../../services/i18n';
import { refreshMaasAccount, refreshMaasBilling, useMaasSession } from '../../services/maasAccount';
import { MaasSessionPhase } from '../../services/maasSession';
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
  const completedModelContext = useRef<string>();
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
    if (!preferencesReady) return;
    // Cleanup runs on sign-out, account switch, re-login and unmount: whatever this run still has in
    // flight must then stop writing, while the sign-out cleanup below always runs.
    let active = true;
    const deps = {
      fetchManagedKey: (id: number) => window.electron.maas.managedKey(id),
      getConfig: () => configService.getConfig(),
      updateConfig: (update: Parameters<typeof configService.updateConfig>[0]) => configService.updateConfig(update),
      fetchApi: window.electron.api.fetch,
      isCurrent: () => active,
      refreshModels: true,
      canWriteConfig: () => !hasActivePlatformConversation(store.getState().cowork),
    };
    if (session.phase !== MaasSessionPhase.SignedIn) completedModelContext.current = undefined;
    if (session.phase === MaasSessionPhase.SignedIn && accountId) {
      // Signing in is the opt-in: the platform registers this account's key the
      // first time StarPath asks for it, and never reuses it for another account.
      // Group changes alter the catalog without rotating the key. Apply only the
      // latest account/group after every running conversation has finished.
      if (!conversationActive && completedModelContext.current !== modelContext) {
        void syncManagedPlatformKey(accountId, deps).then(completed => {
          if (completed && active) completedModelContext.current = modelContext;
        }).catch(error => console.warn('[PlatformSessionGate] Managed key sync failed:', error));
      }
    } else if (session.phase === MaasSessionPhase.SignedOut) {
      void clearManagedPlatformKey(deps).catch(error => console.warn('[PlatformSessionGate] Managed key cleanup failed:', error));
    }
    return () => { active = false; };
  }, [preferencesReady, session.phase, accountId, modelContext, conversationActive, accountRefreshRevision]);
  useEffect(() => {
    if (session.phase !== MaasSessionPhase.SignedIn) return;
    let active = true;
    const check = () => {
      if (!document.hidden) void refreshMaasAccount().then(() => {
        if (!active) return;
        // Retry failed model syncs through the existing account-refresh cadence.
        // Completed contexts skip rediscovery, including ordinary billing updates.
        setAccountRefreshRevision(revision => revision + 1);
        return refreshMaasBilling();
      });
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
