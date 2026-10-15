import { expect, test } from 'vitest';

import { readStartupAppearance, StartupAppearanceArgument, startupBackground } from './startupAppearance';

test('only accepts an explicit light or dark startup snapshot', () => {
  expect(readStartupAppearance([`${StartupAppearanceArgument}dark`])).toBe('dark');
  expect(readStartupAppearance([`${StartupAppearanceArgument}light`])).toBe('light');
  expect(readStartupAppearance([`${StartupAppearanceArgument}system`])).toBeUndefined();
  expect(readStartupAppearance(['--unrelated=dark'])).toBeUndefined();
  expect(startupBackground('dark')).toBe('#212121');
  expect(startupBackground('light')).toBe('#FFFFFF');
});
