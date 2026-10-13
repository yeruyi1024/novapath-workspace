import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';

import { configService } from '../../services/config';
import { i18nService } from '../../services/i18n';
import { refreshMaasAccount, refreshMaasBilling, useMaasSession } from '../../services/maasAccount';
import { MaasSessionPhase } from '../../services/maasSession';
import { themeService } from '../../services/theme';
import WorkspaceLoadingScreen from '../common/WorkspaceLoadingScreen';
import WelcomeDialog from '../WelcomeDialog';
import WindowsAppTitleBar from '../window/WindowsAppTitleBar';

export default function PlatformSessionGate({ children }: { children: ReactNode }) {
  const session = useMaasSession();
  const [preferencesReady, setPreferencesReady] = useState(false);
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
  useEffect(() => {
    if (session.phase !== MaasSessionPhase.SignedIn) return;
    const check = () => {
      if (!document.hidden) void refreshMaasAccount().then(() => refreshMaasBilling());
    };
    void refreshMaasBilling();
    const timer = window.setInterval(check, 5 * 60_000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    const completeCleanup = window.electron.cowork.onStreamComplete(() => { void refreshMaasBilling(); });
    const errorCleanup = window.electron.cowork.onStreamError(() => { void refreshMaasBilling(); });
    return () => {
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
      error={session.logoutRemoteFailed ? i18nService.t('maasLogoutOffline') : session.error ? i18nService.t(`maasError_${session.error}`) : undefined}
      onRetry={() => { void refreshMaasAccount(); }}
    />
  </div>;
}
