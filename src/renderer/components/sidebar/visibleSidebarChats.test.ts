import { describe, expect, it } from 'vitest';

import { visibleSidebarChats } from './visibleSidebarChats';

describe('visibleSidebarChats', () => {
  const chats = Array.from({ length: 10 }, (_, index) => ({ id: String(index), status: 'completed', pinned: index === 8 }));
  it('keeps current, pinned and running chats visible without changing source order', () => {
    const input = chats.map(chat => chat.id === '7' ? { ...chat, status: 'running' } : chat.id === '6' ? { ...chat, status: 'error' } : chat);
    expect(visibleSidebarChats(input, false, '9').map(chat => chat.id)).toEqual(['0', '1', '2', '3', '4', '6', '7', '8', '9']);
    expect(input).toHaveLength(10);
  });
  it('expands to the complete list and preserves empty lists', () => {
    expect(visibleSidebarChats(chats, true, null)).toBe(chats);
    expect(visibleSidebarChats([], false, null)).toEqual([]);
  });
});
