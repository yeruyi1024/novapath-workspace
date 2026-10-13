import { DEFAULT_MAAS_ORIGIN, type MaasResult, type MaasSnapshot } from '../../shared/auth/maas';

export const MaasSessionPhase = {
  Checking: 'checking', SignedOut: 'signedOut', SignedIn: 'signedIn', Error: 'error',
} as const;

export interface MaasSessionState {
  snapshot: MaasSnapshot;
  phase: typeof MaasSessionPhase[keyof typeof MaasSessionPhase];
  error?: MaasResult['error'];
  logoutRemoteFailed?: boolean;
  billingLoading?: boolean;
  billingError?: MaasResult['error'];
}

/** Only a successful main-process validation grants entry to the workspace. */
export function createMaasSessionStore(fetchSnapshot: () => Promise<MaasResult>, fetchBilling?: () => Promise<MaasResult>) {
  let state: MaasSessionState = { snapshot: { origin: DEFAULT_MAAS_ORIGIN, account: null }, phase: MaasSessionPhase.Checking };
  let initialized = false;
  let revision = 0;
  let pending: Promise<void> | undefined;
  let billingPending: Promise<void> | undefined;
  let billingRevision = 0;
  const listeners = new Set<() => void>();
  const publish = (next: MaasSessionState) => { state = next; listeners.forEach(listener => listener()); };
  const apply = (result: MaasResult): MaasResult => {
    revision += 1;
    if (result.success && !result.twoFactorFlow) {
      const sameAccount = state.snapshot.origin === result.snapshot.origin && state.snapshot.account?.id === result.snapshot.account?.id;
      publish({ snapshot: result.snapshot, phase: result.snapshot.account ? MaasSessionPhase.SignedIn : MaasSessionPhase.SignedOut,
        ...(sameAccount && result.snapshot.account ? { billingLoading: state.billingLoading, billingError: state.billingError } : {}),
        ...(result.logoutRemoteFailed ? { logoutRemoteFailed: true } : {}) });
    } else if (!result.success) {
      // A transient outage does not discard an already validated session.
      const invalidOwner = state.phase === MaasSessionPhase.SignedIn && (result.snapshot.origin !== state.snapshot.origin
        || (Boolean(result.snapshot.account) && result.snapshot.account?.id !== state.snapshot.account?.id));
      const keepSession = state.phase === MaasSessionPhase.SignedIn && (invalidOwner || Boolean(result.snapshot.account));
      publish({ ...(keepSession ? state : {}), snapshot: keepSession ? state.snapshot : { origin: result.snapshot.origin, account: null },
        phase: keepSession ? MaasSessionPhase.SignedIn : MaasSessionPhase.Error, error: invalidOwner ? 'invalidResponse' : result.error ?? 'network' });
    }
    return result;
  };
  const refresh = (): Promise<void> => {
    if (pending) return pending;
    initialized = true;
    const startedRevision = revision;
    if (state.phase !== MaasSessionPhase.SignedIn) publish({ ...state, phase: MaasSessionPhase.Checking, error: undefined });
    pending = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          fetchSnapshot(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('network')), 25_000); }),
        ]);
        if (revision === startedRevision) apply(result);
      } catch {
        if (revision === startedRevision) apply({ success: false, snapshot: state.snapshot, error: 'network' });
      } finally { clearTimeout(timer); }
    })().finally(() => { pending = undefined; });
    return pending;
  };
  const refreshBilling = (): Promise<void> => {
    if (!fetchBilling || state.phase !== MaasSessionPhase.SignedIn || !state.snapshot.account) return Promise.resolve();
    if (billingPending) return billingRevision === revision ? billingPending : billingPending.then(() => refreshBilling());
    const startedRevision = revision;
    billingRevision = revision;
    publish({ ...state, billingLoading: true, billingError: undefined });
    billingPending = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          fetchBilling(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('network')), 65_000); }),
        ]);
        if (revision !== startedRevision) return;
        if (result.success) {
          if (result.snapshot.origin !== state.snapshot.origin || (result.snapshot.account && (result.snapshot.account.id !== state.snapshot.account?.id
            || result.snapshot.billing?.accountId !== result.snapshot.account.id))) {
            publish({ ...state, billingError: 'invalidResponse' });
          } else if (result.snapshot.account) {
            // Billing data must not invalidate an in-flight session validation.
            publish({ ...state, snapshot: result.snapshot, billingError: undefined });
          } else {
            apply(result);
            publish({ ...state, billingError: undefined });
          }
        } else {
          publish({ ...state, billingError: result.error ?? 'network' });
        }
      } catch {
        if (revision === startedRevision) publish({ ...state, billingError: 'network' });
      } finally {
        clearTimeout(timer);
      }
    })().finally(() => {
      billingPending = undefined;
      if (state.billingLoading) publish({ ...state, billingLoading: false });
    });
    return billingPending;
  };
  return {
    getState: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    apply, refresh, refreshBilling,
    initialize: () => { if (!initialized) void refresh(); },
  };
}
