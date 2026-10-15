import { accountInitial } from './platformAccountPresentation';

export default function PlatformAccountAvatar({ name, large = false }: { name: string; large?: boolean }) {
  return <span aria-hidden="true" className={`platform-account-avatar ${large ? 'platform-account-avatar-large' : ''}`}>
    {accountInitial(name)}
  </span>;
}
