import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';

import { previewConversationFile } from '../../services/conversationFilePreview';
import { i18nService } from '../../services/i18n';
import { showToast } from '../../utils/localFileActions';
import { ConversationFilePreviewContext } from './ConversationFilePreviewContext';

export default function ConversationFilePreviewProvider({ sessionId, cwd, children }: { sessionId: string; cwd: string; children: ReactNode }) {
  const dispatch = useDispatch();
  const active = useRef({ sessionId, mounted: true, request: 0 });
  active.current.sessionId = sessionId;
  useEffect(() => {
    const context = active.current;
    context.mounted = true;
    return () => { context.mounted = false; };
  }, []);
  const preview = useCallback(async (filePath: string) => {
    const request = ++active.current.request;
    const isCurrent = () => active.current.mounted && active.current.sessionId === sessionId && active.current.request === request;
    try {
      return await previewConversationFile(filePath, { sessionId, cwd, dispatch, isCurrent });
    } catch (error) {
      console.warn('[ConversationPreview] Failed to read referenced file', error);
      if (isCurrent()) showToast(i18nService.t('workspaceFileError'));
      return true;
    }
  }, [sessionId, cwd, dispatch]);
  return <ConversationFilePreviewContext.Provider value={preview}>{children}</ConversationFilePreviewContext.Provider>;
}
