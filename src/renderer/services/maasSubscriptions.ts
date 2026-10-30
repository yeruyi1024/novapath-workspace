import type { MaasResult } from '../../shared/auth/maas';
import type { MaasSubscriptions } from '../../shared/auth/maasSubscriptions';

export interface MaasSubscriptionsState {
  data?: MaasSubscriptions; loading: boolean; error?: MaasResult['error'];
}

export function createMaasSubscriptionsStore(
  accountId: number, origin: string, fetch: () => Promise<MaasResult>, onSignedOut: (result: MaasResult) => void,
) {
  let state: MaasSubscriptionsState = { loading: false };
  let pending: Promise<void> | undefined;
  let disposed = false;
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (next: MaasSubscriptionsState) => {
    if (disposed) return;
    state = next;
    listeners.forEach(listener => listener());
  };
  const refresh = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending) return pending;
    const startedGeneration = generation;
    publish({ ...state, loading: true, error: undefined });
    pending = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          Promise.resolve().then(fetch), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('network')), 110_000); }),
        ]);
        if (disposed || generation !== startedGeneration) return;
        if (result.snapshot.origin !== origin) {
          publish({ loading: false, error: 'invalidResponse' });
        } else if (!result.snapshot.account && (result.success || result.error === 'loginRejected')) {
          publish({ loading: false });
          onSignedOut({ ...result, success: true });
        } else if (result.snapshot.account?.id !== accountId) {
          publish({ loading: false, error: 'invalidResponse' });
        } else if (!result.success) {
          publish({ ...state, loading: false, error: result.error ?? 'network' });
        } else if (result.subscriptions?.accountId !== accountId || result.subscriptions.origin !== origin) {
          publish({ ...state, loading: false, error: 'invalidResponse' });
        } else {
          const incoming = result.subscriptions;
          if (!incoming.errors) { publish({ data: incoming, loading: false }); return; }
          const previous = state.data;
          const errors = { ...incoming.errors };
          // The platform can mask a database failure as an empty success. Keep visible evidence for review.
          if (previous?.subscriptions.length && !incoming.subscriptions.length) errors.subscriptions = true;
          const data = { ...incoming, errors, sectionSyncedAt: { ...previous?.sectionSyncedAt } };
          for (const section of ['plans', 'subscriptions', 'wallet', 'payment'] as const) {
            if (!errors[section]) data.sectionSyncedAt[section] = incoming.syncedAt;
          }
          if (errors.plans && previous) data.plans = previous.plans;
          if (errors.subscriptions && previous) {
            data.subscriptions = previous.subscriptions;
            data.billingPreference = previous.billingPreference;
            data.historyComplete = previous.historyComplete;
          }
          if (errors.wallet && previous) data.wallet = previous.wallet;
          if (errors.payment && previous) {
            data.paymentCompliance = previous.paymentCompliance;
            data.pendingPurchase = previous.pendingPurchase;
          }
          publish({ data, loading: false, ...(Object.values(errors).some(Boolean) ? { error: 'network' as const } : {}) });
        }
      } catch {
        if (generation === startedGeneration) publish({ ...state, loading: false, error: 'network' });
      } finally { clearTimeout(timer); if (generation === startedGeneration) pending = undefined; }
    })();
    return pending;
  };
  return { getState: () => state, refresh,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate: () => { disposed = false; },
    dispose: () => { disposed = true; generation += 1; pending = undefined; },
  };
}
