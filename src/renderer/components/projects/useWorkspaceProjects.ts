import { useEffect, useSyncExternalStore } from 'react';

import { i18nService } from '../../services/i18n';
import { workspaceProjects } from '../../services/workspaceProjects';

export function useWorkspaceProjects() {
  const state = useSyncExternalStore(workspaceProjects.subscribe, workspaceProjects.getSnapshot);
  useEffect(() => {
    void workspaceProjects.initialize().catch(error => {
      console.error('[Projects] Failed to load projects:', error);
      window.dispatchEvent(new CustomEvent('app:showToast', { detail: i18nService.t('projectSaveError') }));
    });
  }, []);
  return state;
}
