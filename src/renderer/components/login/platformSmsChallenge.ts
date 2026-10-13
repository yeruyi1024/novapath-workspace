import type { MaasResult } from '../../../shared/auth/maas';

export interface PlatformSmsChallenge {
  token: string;
  origin: string;
  phone: string;
  expiresAt: number;
  retryAt: number;
}

export function createPlatformSmsChallenge(
  value: MaasResult['smsChallenge'], origin: string, phone: string, now: number,
): PlatformSmsChallenge | undefined {
  if (!value?.token || !Number.isFinite(value.retryAfter) || value.retryAfter <= 0
    || !Number.isFinite(value.expiresIn) || value.expiresIn <= 0) return undefined;
  return { token: value.token, origin, phone,
    retryAt: now + Math.min(3600, Math.ceil(value.retryAfter)) * 1000,
    expiresAt: now + Math.min(3600, Math.ceil(value.expiresIn)) * 1000 };
}

export function smsRetrySeconds(retryAt: number, now: number): number {
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

export function isPlatformSmsChallengeValid(challenge: PlatformSmsChallenge | undefined, origin: string, phone: string, now: number): boolean {
  return Boolean(challenge && challenge.origin === origin && challenge.phone === phone && challenge.expiresAt > now);
}

export function maskedSmsPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
