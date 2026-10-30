import './platformAccount.css';

import { ArrowPathIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import type { MaasProfileField } from '../../../shared/auth/maasProfile';
import { i18nService } from '../../services/i18n';
import { applyMaasResult, refreshMaasAccount, useMaasSession } from '../../services/maasAccount';
import PlatformProfileCard from './PlatformProfileCard';
import PlatformProfileEditor from './PlatformProfileEditor';

interface Props { account: MaasAccount; onClose?: () => void }

export default function PlatformAccountDetails({ account, onClose }: Props) {
  const session = useMaasSession();
  useSyncExternalStore(listener => i18nService.subscribe(listener), () => i18nService.getLanguage());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [editingField, setEditingField] = useState<MaasProfileField>();
  const [profileBusy, setProfileBusy] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const active = useRef(true);
  const t = (key: string) => i18nService.t(key);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const refresh = async () => {
    if (pending) return;
    setPending(true); setError('');
    try {
      await refreshMaasAccount();
    } catch {
      if (active.current) setError(t('maasError_network'));
    } finally {
      if (active.current) setPending(false);
    }
  };
  const logout = async () => {
    if (pending) return;
    setPending(true); setError('');
    try {
      const result = await window.electron.maas.logout();
      if (active.current) {
        if (result.success) onClose?.();
        else setError(t(`maasError_${result.error ?? 'network'}`));
      }
      applyMaasResult(result);
    } catch { if (active.current) setError(t('maasError_network')); }
    finally { if (active.current) setPending(false); }
  };

  return <>
    <div className="platform-account-body platform-profile-body">
      <PlatformProfileCard account={account} busy={pending || profileBusy} editingField={editingField}
        headerAction={<button type="button" disabled={pending || profileBusy} onClick={() => { void refresh(); }}
          className="platform-profile-sync" aria-label={t('maasRefreshProfile')} title={t('maasRefreshProfile')}>
          <ArrowPathIcon aria-hidden="true" className={`h-3.5 w-3.5 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`} />
        </button>}
        onEdit={field => { setSavedNotice(''); setEditingField(previous => previous === field ? undefined : field); }}
        editor={editingField && <PlatformProfileEditor key={editingField} account={account} field={editingField}
          onBusyChange={setProfileBusy} onCancel={() => setEditingField(undefined)}
          onSaved={syncPending => { setEditingField(undefined); setSavedNotice(t(syncPending ? 'profileSyncPending' : 'profileSaved')); }} />} />
      {savedNotice && <p role="status" className="platform-account-notice">{savedNotice}</p>}
      {session.error && <p role="alert" className="platform-account-notice text-error">{t('profileStaleHint')} {t(`maasError_${session.error}`)}</p>}
      {error && <p role="alert" className="platform-account-notice text-error">{error}</p>}
    </div>
    <footer className="platform-account-footer platform-profile-footer">
      <button type="button" disabled={pending || profileBusy} onClick={() => { void logout(); }} className="platform-account-text-button"><ArrowRightStartOnRectangleIcon aria-hidden="true" className="h-4 w-4" />{t('authLogout')}</button>
      {onClose && <button type="button" onClick={onClose} className="platform-account-button">{t('close')}</button>}
    </footer>
  </>;
}
