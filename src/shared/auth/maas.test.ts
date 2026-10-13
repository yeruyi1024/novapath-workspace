import { describe, expect, test } from 'vitest';

import { normalizeMaasOrigin, parseMaasAccount } from './maas';

describe('platform address boundary', () => {
  test.each([
    [' https://gateway.ai.shilijia.xyz/ ', 'https://gateway.ai.shilijia.xyz'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['http://127.0.0.1:3000/', 'http://127.0.0.1:3000'],
    ['http://[::1]:3000/', 'http://[::1]:3000'],
  ])('accepts %s', (input, expected) => expect(normalizeMaasOrigin(input)).toBe(expected));

  test.each(['http://example.com', 'javascript:alert(1)', 'file:///tmp/test',
    'https://user:password@example.com', 'https://example.com/sign-in',
    'https://example.com/?token=secret', 'https://example.com/#token', '', null])(
    'rejects insecure or ambiguous destination %s', input => expect(() => normalizeMaasOrigin(input)).toThrow(),
  );
});

describe('safe account IPC projection', () => {
  test('includes account and actual quotas while excluding credentials', () => {
    expect(parseMaasAccount({ id: 12, username: 'demo', display_name: '演示', quota: 500000,
      used_quota: 1000, access_token: 'secret', password: 'secret', permissions: { admin: true } }))
      .toEqual({ id: 12, username: 'demo', displayName: '演示', quota: 500000, usedQuota: 1000 });
  });
  test.each([null, {}, { id: 1, username: 'demo', quota: Infinity, used_quota: 0 },
    { id: 1.1, username: 'demo', quota: 0, used_quota: 0 }])(
    'rejects malformed users', input => expect(() => parseMaasAccount(input)).toThrow(),
  );
});
