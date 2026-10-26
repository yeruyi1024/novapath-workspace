import type { MaasSubscriptions } from '../../../shared/auth/maasSubscriptions';
import { i18nService } from '../../services/i18n';
import { formatSubscriptionDate } from './platformAccountPresentation';

export default function PlatformSubscriptionSyncHint({ data, section, locale }: {
  data?: MaasSubscriptions; section: 'plans' | 'subscriptions' | 'wallet'; locale: string;
}) {
  if (!data?.errors?.[section]) return null;
  const syncedAt = data.sectionSyncedAt?.[section];
  return <p role="status" className="platform-plan-hint">
    {i18nService.t(syncedAt ? 'maasSubscriptionSectionStale' : 'maasSubscriptionSectionUnavailable')}
    {syncedAt ? ' · ' + formatSubscriptionDate(syncedAt / 1000, locale, key => i18nService.t(key)) : ''}
  </p>;
}
