import { i18nService } from '../../services/i18n';
import { useMaasAccount } from '../../services/maasAccount';
import PlatformAccountDetails from '../login/PlatformAccountDetails';

export default function PlatformAccountSettings() {
  const { account, origin } = useMaasAccount();
  if (!account) return <p className="text-sm text-secondary">{i18nService.t('maasLoginTitle')}</p>;
  return <section className="settings-account-profile">
    <PlatformAccountDetails key={`${origin}:${account.id}`} account={account} />
  </section>;
}
