type Drafts = Record<string, string>;
interface Dependencies {
  read: () => Promise<unknown>;
  write: (drafts: Drafts) => Promise<void>;
  getDrafts: () => Drafts;
  restore: (key: string, text: string) => void;
  subscribe: (listener: () => void) => () => void;
  onError: () => void;
}

export const PROMPT_DRAFT_STORAGE_KEY = 'product.prompt-drafts.v1';

function readDrafts(raw: unknown): Drafts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([key, text]) => (
    /^[\w-]{1,100}$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key)
    && typeof text === 'string' && text.length > 0
  )));
}

/** Persist text in main-process storage, independently of mutable renderer URLs. */
export function createPromptDraftPersistence(deps: Dependencies) {
  let initialization: Promise<void> | null = null;
  let last = deps.getDrafts();
  let ready = false;
  let writes = Promise.resolve();
  const edited = new Set<string>();
  const save = () => {
    const snapshot = { ...deps.getDrafts() };
    writes = writes.then(() => deps.write(snapshot)).catch(() => deps.onError());
  };
  return {
    initialize(): Promise<void> {
      if (initialization) return initialization;
      deps.subscribe(() => {
        const next = deps.getDrafts();
        if (next === last) return;
        if (!ready) {
          for (const key of new Set([...Object.keys(last), ...Object.keys(next)])) {
            if (last[key] !== next[key]) edited.add(key);
          }
        }
        last = next;
        if (ready) save();
      });
      initialization = deps.read().then(raw => {
        const saved = readDrafts(raw);
        for (const [key, text] of Object.entries(saved)) {
          if (!edited.has(key) && !deps.getDrafts()[key]) deps.restore(key, text);
        }
        ready = true;
        if (edited.size > 0) save();
      });
      return initialization;
    },
    flush: () => writes,
  };
}
