import { expect, test, vi } from 'vitest';

import { createManagedModelRefresh } from './managedModelRefresh';
const state = (revision = 0, busy = false, key = 'platform/account/default') => ({ key, accountId: 7, revision, busy });
test('an unchanged group is rechecked on a later account refresh and burst events are throttled', async () => {
 let now = 0;
 const run = vi.fn().mockResolvedValue(true);
 const scheduler = createManagedModelRefresh(run, vi.fn(), () => now);
 scheduler.update(state());
 await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
 await Promise.resolve(); await Promise.resolve();
 scheduler.update(state(1)); scheduler.update(state(2));
 await Promise.resolve(); await Promise.resolve();
 expect(run).toHaveBeenCalledTimes(1);
 now = 6000; scheduler.update(state(3));
 await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
 scheduler.dispose();
});
test('overlapping checks are serialized and the stale result cannot write', async () => {
 const releases: Array<() => void> = [];
 const guards: Array<() => boolean> = [];
 const run = vi.fn((_id: number, current: () => boolean) => { guards.push(current); return new Promise<boolean>(resolve => releases.push(() => resolve(true))); });
 const scheduler = createManagedModelRefresh(run, vi.fn());
 scheduler.update(state());
 await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
 scheduler.update(state(1)); scheduler.update(state(2));
 expect(run).toHaveBeenCalledTimes(1); expect(guards[0]()).toBe(false);
 releases[0]();
 await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
 expect(guards[1]()).toBe(true);
 releases[1](); scheduler.dispose();
});
test('running conversations defer refresh and invalidate a discovery that was already in flight', async () => {
 let release!: () => void; let current!: () => boolean;
 const run = vi.fn((_id: number, guard: () => boolean) => { current = guard; return new Promise<boolean>(resolve => { release = () => resolve(true); }); });
 const scheduler = createManagedModelRefresh(run, vi.fn());
 scheduler.update(state(0, true)); await Promise.resolve(); expect(run).not.toHaveBeenCalled();
 scheduler.update(state(0)); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
 scheduler.update(state(0, true)); expect(current()).toBe(false); release();
 await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
 expect(run).toHaveBeenCalledTimes(1);
 scheduler.update(state(0)); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
 release(); scheduler.dispose();
});
test('sign-out invalidates pending work and same-account re-login cannot reuse a completion marker', async () => {
 const run = vi.fn().mockResolvedValue(true);
 const scheduler = createManagedModelRefresh(run, vi.fn());
 scheduler.update(state()); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
 await Promise.resolve(); await Promise.resolve();
 scheduler.update(null); scheduler.update(state());
 await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
 scheduler.dispose();
});
test('a failed check has no automatic retry loop, but the next account check retries', async () => {
 const error = vi.fn(); const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(true);
 const scheduler = createManagedModelRefresh(run, error);
 scheduler.update(state()); await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
 expect(run).toHaveBeenCalledTimes(1);
 scheduler.update(state(1)); await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
 scheduler.dispose();
});
