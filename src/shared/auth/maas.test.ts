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

test('projects only validated profile fields and never forwards security data', () => {
  const user = { id: 3, username: 'profile-user', quota: 0, used_quota: 0,
    email: ' member@example.test ', group: ' team ', role: 10, status: 2,
    access_token: 'private-token', setting: '{"secret":"private-setting"}' };
  const profile = parseMaasAccount(user);
  expect(profile).toMatchObject({ email: 'member@example.test', group: 'team', role: 10, status: 2 });
  expect(JSON.stringify(profile)).not.toMatch(/private-token|private-setting/);
  expect(parseMaasAccount({ ...user, email: {}, group: 'x'.repeat(129), role: '100', status: Infinity }))
    .toEqual({ id: 3, username: 'profile-user', displayName: 'profile-user', quota: 0, usedQuota: 0 });
});

test('projects bounded phone data for synchronization without forwarding identity claims', () => {
  const user = { id: 3, username: 'member', quota: 0, used_quota: 0, phone: ' +8613800000000 ', verified: { proof_token: 'private' } };
  expect(parseMaasAccount(user).phone).toBe('+8613800000000');
  expect(JSON.stringify(parseMaasAccount(user))).not.toContain('private');
  expect(parseMaasAccount({ ...user, phone: 'x'.repeat(33) }).phone).toBeUndefined();
});
