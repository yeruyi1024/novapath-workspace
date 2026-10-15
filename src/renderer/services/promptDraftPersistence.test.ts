import { describe, expect, it, vi } from 'vitest';

import { createPromptDraftPersistence } from './promptDraftPersistence';

function fixture(read: () => Promise<unknown>) {
  let drafts: Record<string, string> = {};
  let changed = (): void => {};
  const write = vi.fn<(value: Record<string, string>) => Promise<void>>().mockResolvedValue();
  const onError = vi.fn();
  const edit = (key: string, text: string) => {
    drafts = { ...drafts };
    if (text) drafts[key] = text;
    else delete drafts[key];
    changed();
  };
  const persistence = createPromptDraftPersistence({
    read, write, getDrafts: () => drafts, restore: edit, onError,
    subscribe: listener => { changed = listener; return () => {}; },
  });
  return { persistence, edit, write, onError, getDrafts: () => drafts };
}

describe('prompt draft persistence', () => {
  it('restores text in home and conversation drafts after a new process starts', async () => {
    const first = fixture(async () => null);
    await first.persistence.initialize();
    first.edit('__home__', '首页草稿');
    first.edit('session-1', '语音识别文字');
    await first.persistence.flush();
    const stored = first.write.mock.calls[first.write.mock.calls.length - 1]?.[0];
    const restarted = fixture(async () => stored);
    await restarted.persistence.initialize();
    expect(restarted.getDrafts()).toEqual({ __home__: '首页草稿', 'session-1': '语音识别文字' });
  });

  it('does not replace newer edits or cleared drafts with a late storage reply', async () => {
    let resolve!: (value: unknown) => void;
    const f = fixture(() => new Promise(done => { resolve = done; }));
    const loading = f.persistence.initialize();
    f.edit('session-1', '新输入');
    f.edit('session-2', '刚提交');
    f.edit('session-2', '');
    resolve({ 'session-1': '旧输入', 'session-2': '旧草稿', 'session-3': '保留草稿' });
    await loading;
    await f.persistence.flush();
    expect(f.getDrafts()).toEqual({ 'session-1': '新输入', 'session-3': '保留草稿' });
    expect(f.write.mock.calls[f.write.mock.calls.length - 1]?.[0]).toEqual(f.getDrafts());
  });

  it('orders writes so a slow save cannot bring back submitted text', async () => {
    let release!: () => void;
    const f = fixture(async () => null);
    await f.persistence.initialize();
    f.write.mockImplementationOnce(() => new Promise(done => { release = done; }));
    f.edit('session-1', '待发送');
    await Promise.resolve();
    f.edit('session-1', '');
    expect(f.write).toHaveBeenCalledTimes(1);
    release();
    await f.persistence.flush();
    expect(f.write.mock.calls[f.write.mock.calls.length - 1]?.[0]).toEqual({});
  });

  it('recovers on the next edit after a save failure without discarding text', async () => {
    const f = fixture(async () => null);
    await f.persistence.initialize();
    f.write.mockRejectedValueOnce(new Error('storage unavailable'));
    f.edit('session-1', '文字');
    await f.persistence.flush();
    expect(f.onError).toHaveBeenCalledOnce();
    f.edit('session-1', '新文字');
    await f.persistence.flush();
    expect(f.write.mock.calls[f.write.mock.calls.length - 1]?.[0]).toEqual({ 'session-1': '新文字' });
  });

  it('does not overwrite stored drafts when the initial read fails', async () => {
    const f = fixture(async () => { throw new Error('storage unavailable'); });
    await expect(f.persistence.initialize()).rejects.toThrow('storage unavailable');
    f.edit('session-1', '当前文字');
    await f.persistence.flush();
    expect(f.write).not.toHaveBeenCalled();
  });

  it('ignores malformed persisted values and initializes only once', async () => {
    const read = vi.fn(async () => JSON.parse('{"__proto__":"bad","session-1":123,"session-2":"有效"}'));
    const f = fixture(read);
    await Promise.all([f.persistence.initialize(), f.persistence.initialize()]);
    expect(read).toHaveBeenCalledOnce();
    expect(f.getDrafts()).toEqual({ 'session-2': '有效' });
  });
});
