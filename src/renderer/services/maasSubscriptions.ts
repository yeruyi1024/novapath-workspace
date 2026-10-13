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
        } else if (result.success && !result.snapshot.account) {
          publish({ loading: false });
          onSignedOut(result);
        } else if (result.snapshot.account?.id !== accountId) {
          publish({ loading: false, error: 'invalidResponse' });
        } else if (!result.success) {
          publish({ ...state, loading: false, error: result.error ?? 'network' });
        } else if (result.subscriptions?.accountId !== accountId || result.subscriptions.origin !== origin) {
          publish({ ...state, loading: false, error: 'invalidResponse' });
        } else {
          publish({ data: result.subscriptions, loading: false });
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
