import { afterEach, expect, test, vi } from 'vitest';

import { ShellOpenFailureReason } from '../../shared/shell/constants';
import { i18nService } from '../services/i18n';
import { getShellFailureMessage, showShellFailureToast } from './localFileActions';

afterEach(() => vi.unstubAllGlobals());

test('explains file access errors without exposing raw system diagnostics', () => {
  expect(getShellFailureMessage({ success: false, reason: ShellOpenFailureReason.NotFound }, 'openFileFailed'))
    .toBe(i18nService.t('localFileNotFound'));
  expect(getShellFailureMessage({ success: false, reason: ShellOpenFailureReason.PermissionDenied }, 'openFileFailed'))
    .toBe(i18nService.t('localFilePermissionDenied'));
  expect(getShellFailureMessage({ success: false, error: 'OS diagnostic /private/path secret-fixture' }, 'openFileFailed'))
    .toBe(i18nService.t('openFileFailed'));
});

test('file failures request an error toast while keeping the existing event channel', () => {
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { dispatchEvent });
  vi.stubGlobal('CustomEvent', class { constructor(public type: string, public options: {detail: unknown}) {} });
  showShellFailureToast({ success: false, reason: ShellOpenFailureReason.NotFound });
  expect(dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
    type: 'app:showToast', options: { detail: {message: i18nService.t('localFileNotFound'), tone: 'error'} },
  }));
});
