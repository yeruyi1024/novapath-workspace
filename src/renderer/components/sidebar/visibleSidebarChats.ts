interface SidebarChat {
  id: string;
  pinned?: boolean;
  status: string;
}

/** Keep the selected, pinned and running conversations reachable in a folded list. */
export function visibleSidebarChats<T extends SidebarChat>(
  chats: T[], expanded: boolean, currentId: string | null, limit = 5,
): T[] {
  if (expanded) return chats;
  return chats.filter((chat, index) => index < limit || chat.id === currentId
    || chat.pinned || chat.status === 'running' || chat.status === 'error');
}
