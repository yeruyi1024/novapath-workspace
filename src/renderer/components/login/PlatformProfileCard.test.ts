import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import type { MaasAccount } from '../../../shared/auth/maas';
import { i18nService } from '../../services/i18n';
import PlatformProfileCard from './PlatformProfileCard';
import PlatformProfileEditor from './PlatformProfileEditor';

const account: MaasAccount = { id: 3, username: 'member', displayName: 'Test Member', quota: 123, usedQuota: 45 };

test('profile displays platform identity separately from wallet, subscriptions and internal admin fields', () => {
  const html = renderToStaticMarkup(createElement(PlatformProfileCard, { account: {
    ...account, email: 'member@example.test', group: 'team', role: 10, status: 2,
  } }));
  expect(html).toContain('member');
  expect(html).toContain('Test Member');
  expect(html).toContain('member@example.test');
  expect(html).toContain(i18nService.t('profileStatusDisabled'));
  expect(html).not.toContain(`<dd>${i18nService.t('profileStatusDisabled')}</dd>`);
  expect(html).not.toContain(`<dt>${i18nService.t('profileUsername')}</dt>`);
  expect(html).not.toContain('team');
  expect(html).not.toContain(i18nService.t('profileRoleAdmin'));
  expect(html).not.toContain(i18nService.t('maasAccountId'));
  expect(html).not.toContain(i18nService.t('maasSignedIn'));
  expect(html).not.toContain('123');
});

test('missing profile data does not invent account status or duplicate identical displayName', () => {
  const html = renderToStaticMarkup(createElement(PlatformProfileCard, { account: { ...account, displayName: 'member' } }));
  expect(html).toContain(i18nService.t('profileUnbound'));
  expect(html).toContain(i18nService.t('profileUnknown'));
  expect(html).not.toContain(i18nService.t('profileStatusActive'));
  expect(html).not.toContain('<p>member</p>');
});

test('profile data is rendered as text and replaced with the next account', () => {
  const oldHtml = renderToStaticMarkup(createElement(PlatformProfileCard, { account: { ...account, email: 'old@example.test' } }));
  const newHtml = renderToStaticMarkup(createElement(PlatformProfileCard, { account: { ...account, id: 4, username: 'next', displayName: '<script>unsafe</script>' } }));
  expect(oldHtml).toContain('old@example.test');
  expect(newHtml).not.toContain('old@example.test');
  expect(newHtml).not.toContain('<script>');
  expect(newHtml).toContain('&lt;script&gt;');
});

test('unconfirmed backend status values stay unconfirmed', () => {
  const html = renderToStaticMarkup(createElement(PlatformProfileCard, { account: { ...account, role: 7, status: 3 } }));
  expect(html).toContain(i18nService.t('profileUnknown'));
  expect(html).not.toContain(i18nService.t('profileStatusActive'));
});

test('editable profile has separate contact actions without repeating the nickname in its heading', () => {
  const html = renderToStaticMarkup(createElement(PlatformProfileCard, { account: { ...account, phone: '+8613800000000' }, onEdit: () => {} }));
  expect(html).toContain('+8613800000000');
  expect(html).toContain(i18nService.t('profileEditField').replace('{field}', i18nService.t('profilePhone')));
  expect(html).toContain(i18nService.t('profileEditField').replace('{field}', i18nService.t('profileEmail')));
  expect(html.match(/Test Member/g)).toHaveLength(1);
});

test('name editor uses an explicit save and leaves credentials out of the form', () => {
  const html = renderToStaticMarkup(createElement(PlatformProfileEditor, { account, field: 'displayName', onCancel: () => {}, onSaved: () => {}, onBusyChange: () => {} }));
  expect(html).toContain('type="submit"');
  expect(html).toContain('value="Test Member"');
  expect(html).not.toContain('type="password"');
  expect(html).not.toContain('one-time-code');
});

test('only the selected contact row contains the editor and its trigger identifies that region', () => {
  const html = renderToStaticMarkup(createElement(PlatformProfileCard, {
    account, onEdit: () => {}, editingField: 'email', editor: createElement('form', { 'aria-label': 'Contact editor' }),
  }));
  expect(html.match(/<form/g)).toHaveLength(1);
  const trigger = html.match(/aria-expanded="true" aria-controls="([^"]+)"/);
  expect(trigger).not.toBeNull();
  expect(html).toContain(`id="${trigger![1]}"><form aria-label="Contact editor"`);
  expect(html).toContain('hidden=""');
});
