export const StartupAppearanceArgument = '--novapath-initial-appearance=';
export type StartupAppearance = 'light' | 'dark';

export function readStartupAppearance(args: string[]): StartupAppearance | undefined {
  const value = args.find(argument => argument.startsWith(StartupAppearanceArgument))?.slice(StartupAppearanceArgument.length);
  return value === 'light' || value === 'dark' ? value : undefined;
}

export function startupBackground(appearance: StartupAppearance): string {
  return appearance === 'dark' ? '#212121' : '#FFFFFF';
}
