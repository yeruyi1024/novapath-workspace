export interface ManagedModelRefreshState {
  key: string;
  accountId: number;
  revision: number;
  busy: boolean;
}

/** Serialize account-triggered discovery; a newer check or busy session makes
 * the current result obsolete without starting a second concurrent request. */
export function createManagedModelRefresh(
  run: (accountId: number, isCurrent: () => boolean) => Promise<boolean>,
  onError: (error: unknown) => void,
  now: () => number = Date.now,
) {
  let desired: ManagedModelRefreshState | null = null;
  let generation = 0;
  let inFlight = false;
  let disposed = false;
  let completed: string | undefined;
  let failed: string | undefined;
  let lastSuccess: { key: string; at: number } | undefined;
  const signature = (state: ManagedModelRefreshState) => JSON.stringify([state.key, state.accountId, state.revision]);
  function pump() {
    if (disposed || inFlight || !desired || desired.busy) return;
    const state = desired;
    const marker = signature(state);
    if (marker === completed || marker === failed) return;
    // focus/online/visibility often arrive together. Do not rediscover or
    // reconfigure an already checked account several times within that burst.
    if (lastSuccess?.key === state.key && now() - lastSuccess.at < 5_000) {
      completed = marker;
      return;
    }
    const started = generation;
    const isCurrent = () => !disposed && started === generation && !desired?.busy;
    inFlight = true;
    void Promise.resolve().then(() => run(state.accountId, isCurrent)).then(success => {
      if (!isCurrent()) return;
      if (success) {
        completed = marker;
        lastSuccess = { key: state.key, at: now() };
      } else failed = marker;
    }).catch(error => {
      if (isCurrent()) { failed = marker; onError(error); }
    }).finally(() => {
      inFlight = false;
      if (started !== generation) pump();
    });
  }
  return {
    update(next: ManagedModelRefreshState | null) {
      if (disposed) return;
      if (desired?.key !== next?.key || desired?.accountId !== next?.accountId || desired?.revision !== next?.revision || desired?.busy !== next?.busy) {
        generation++;
        failed = undefined;
      }
      desired = next;
      if (!next) { completed = undefined; lastSuccess = undefined; }
      pump();
    },
    dispose() { disposed = true; generation++; desired = null; },
  };
}
