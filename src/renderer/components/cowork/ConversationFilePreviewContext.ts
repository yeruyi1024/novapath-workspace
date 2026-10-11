import { createContext, useContext } from 'react';

export type PreviewConversationFile = (filePath: string) => Promise<boolean>;
export const ConversationFilePreviewContext = createContext<PreviewConversationFile | null>(null);
export const useConversationFilePreview = () => useContext(ConversationFilePreviewContext);
