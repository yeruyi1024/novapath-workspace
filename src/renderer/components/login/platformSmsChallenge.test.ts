import { expect, test } from 'vitest';

import { createPlatformSmsChallenge, isPlatformSmsChallengeValid, maskedSmsPhone, smsRetrySeconds } from './platformSmsChallenge';

const origin = 'https://example.invalid';
const phone = '13800138000';
test('uses actual server cooldown and catches up after background suspension', () => {
  const challenge = createPlatformSmsChallenge({ token: 'invalid-fixture', retryAfter: 60, expiresIn: 300 }, origin, phone, 1000)!;
  expect(smsRetrySeconds(challenge.retryAt, 1000)).toBe(60);
  expect(smsRetrySeconds(challenge.retryAt, 11_100)).toBe(50);
  expect(smsRetrySeconds(challenge.retryAt, 65_000)).toBe(0);
  expect(isPlatformSmsChallengeValid(challenge, origin, phone, 65_000)).toBe(true);
  expect(isPlatformSmsChallengeValid(challenge, origin, phone, 301_000)).toBe(false);
});
test('a challenge cannot be used after switching its phone or platform', () => {
  const challenge = createPlatformSmsChallenge({ token: 'invalid-fixture', retryAfter: 5, expiresIn: 10 }, origin, phone, 0);
  expect(isPlatformSmsChallengeValid(challenge, origin, '13900139000', 1)).toBe(false);
  expect(isPlatformSmsChallengeValid(challenge, 'https://another.invalid', phone, 1)).toBe(false);
  expect(maskedSmsPhone(phone)).toBe('138****8000');
});
test('invalid server timing never displays a sent state or NaN cooldown', () => {
  expect(createPlatformSmsChallenge({ token: 'invalid-fixture', retryAfter: NaN, expiresIn: 10 }, origin, phone, 0)).toBeUndefined();
  expect(createPlatformSmsChallenge({ token: '', retryAfter: 60, expiresIn: 300 }, origin, phone, 0)).toBeUndefined();
});
