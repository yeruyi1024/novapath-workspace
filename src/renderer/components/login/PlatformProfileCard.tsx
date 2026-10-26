import './platformProfileCard.css';

import { type ReactNode, useId } from 'react';

import type { MaasAccount } from '../../../shared/auth/maas';
import type { MaasProfileField } from '../../../shared/auth/maasProfile';
import { i18nService } from '../../services/i18n';
import PlatformAccountAvatar from './PlatformAccountAvatar';

/** Safe account projection. Only the independent editor may save profile data. */
export default function PlatformProfileCard({ account, onEdit, editingField, editor, busy, headerAction }: {
  account: MaasAccount; onEdit?: (field: MaasProfileField) => void;
  editingField?: MaasProfileField; editor?: ReactNode; busy?: boolean; headerAction?: ReactNode;
}) {
  const editorId = useId();
  const t = (key: string) => i18nService.t(key);
  const distinctDisplayName = account.displayName && account.displayName !== account.username
    ? account.displayName
    : undefined;
  const statusKey = account.status === 1 ? 'profileStatusActive' : account.status === 2 ? 'profileStatusDisabled' : 'profileUnknown';
  const fields: { key: MaasProfileField; label: string; value?: string }[] = [
    { key: 'displayName', label: t('maasDisplayName'), value: account.displayName },
    { key: 'email', label: t('profileEmail'), value: account.email },
    { key: 'phone', label: t('profilePhone'), value: account.phone },
  ];
  return <section className="platform-profile-card" aria-label={t('maasProfileTitle')}>
    <div className="platform-profile-card-heading">
      <PlatformAccountAvatar name={account.username || account.displayName} large />
      <div className="platform-profile-card-name">
        <h2>{account.username}</h2>
        {!onEdit && distinctDisplayName && <p>{distinctDisplayName}</p>}
      </div>
      <div className="platform-profile-card-badges">
        <span aria-label={`${t('profileStatus')}: ${t(statusKey)}`} data-active={account.status === 1 || undefined}>{t(statusKey)}</span>
      </div>
      {headerAction}
    </div>
    <dl className="platform-profile-card-fields">{fields.filter(item => onEdit || item.key !== 'displayName').map(item => <div key={item.key} data-editing={editingField === item.key || undefined}>
      <dt>{item.label}</dt>
      <dd className="platform-profile-row-content">
        <span className="platform-profile-value" data-empty={!item.value || undefined}>{item.value || t(item.key === 'displayName' ? 'profileNotProvided' : 'profileUnbound')}</span>
        {onEdit && <button type="button" disabled={busy} aria-expanded={editingField === item.key}
          aria-controls={`${editorId}-${item.key}`}
          aria-label={t('profileEditField').replace('{field}', item.label)} onClick={() => onEdit(item.key)}>
          {t(item.value ? 'profileEdit' : 'profileBind')}
        </button>}
      </dd>
      {onEdit && <dd className="platform-profile-inline-editor" id={`${editorId}-${item.key}`} hidden={editingField !== item.key}>
        {editingField === item.key && editor}
      </dd>}
    </div>)}</dl>
  </section>;
}
