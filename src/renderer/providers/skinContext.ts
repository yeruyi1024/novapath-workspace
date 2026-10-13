import { createContext, useContext, useMemo } from 'react';

import type { SkinAssetSlot } from '../../shared/skin/constants';
import { type ActiveSkin, buildSkinAssetUrl } from '../services/skin';
import type { ThemeMode, ThemeSelection } from '../services/theme';

export interface SkinContextValue {
  activeSkin: ActiveSkin | null;
  savedSkins: ActiveSkin[];
  isLoading: boolean;
  isAppearanceChanging: boolean;
  refreshVersion: number;
  refresh: () => Promise<void>;
  apply: (skinId: string) => Promise<void>;
  deactivate: () => Promise<void>;
  deleteSkin: (skinId: string) => Promise<void>;
  selectThemeMode: (mode: ThemeMode) => Promise<ThemeSelection>;
  selectThemeById: (themeId: string) => Promise<ThemeSelection>;
}

export const SkinContext = createContext<SkinContextValue | null>(null);

export const useSkin = (): SkinContextValue => {
  const context = useContext(SkinContext);
  if (!context) throw new Error('useSkin must be used within SkinProvider');
  return context;
};

export const useSkinAsset = (slot: SkinAssetSlot): string | null => {
  const { activeSkin, refreshVersion } = useSkin();
  return useMemo(
    () => buildSkinAssetUrl(activeSkin?.assets[slot], refreshVersion),
    [activeSkin, refreshVersion, slot],
  );
};
