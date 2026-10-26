export type MaasProfileField = 'displayName' | 'email' | 'phone';

export type MaasProfileInput = { accountId: number } & (
  | { action: 'updateName'; displayName: string }
  | { action: 'begin'; field: 'email' | 'phone' }
  | { action: 'cancel'; flowId: string }
  | { action: 'openPlatform' }
  | ({ flowId: string } & (
    | { action: 'emailCode'; email: string }
    | { action: 'bindEmail'; email: string; code: string }
    | { action: 'phoneSecurityCode' }
    | { action: 'phoneVerify'; method: 'password'; password: string; twoFactorCode: string }
    | { action: 'phoneVerify'; method: 'sms'; code: string }
    | { action: 'phoneCode'; phone: string }
    | { action: 'bindPhone'; phone: string; code: string }
  ))
);

export type MaasProfileError = 'invalidInput' | 'accountChanged' | 'expired' | 'rejected' | 'verificationInvalid'
  | 'alreadyUsed' | 'protected' | 'rateLimited' | 'smsUnavailable' | 'captchaRequired' | 'network' | 'unavailable' | 'sessionUpdateFailed';

export interface MaasProfileProgress {
  flowId?: string;
  emailCaptchaRequired?: boolean;
  phoneAvailable?: boolean;
  phoneVerified?: boolean;
  retryAt?: number;
  stage?: 'security' | 'binding';
  saved?: boolean;
  syncPending?: boolean;
}

export function normalizeProfileEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalidInput');
  const email = value.trim().toLowerCase();
  if (email.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('invalidInput');
  return email;
}

export function normalizeProfilePhone(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalidInput');
  const phone = value.trim().replace(/^(?:\+86|0086|86)\s*(?=1\d{10}$)/, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('invalidInput');
  return `+86${phone}`;
}
