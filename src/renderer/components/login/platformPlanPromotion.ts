// Client-side marketing overlay for plans returned by the platform.
// Price, title and subtitle always come from the platform; this file only adds
// a "recommended" mark and short selling points. Keyed by platform plan id.
// Leave empty until the real copy is ready: nothing extra is rendered then.

export interface PlanPromotion {
  recommended?: boolean;
  highlights?: { zh: string[]; en: string[] };
}

export const PLAN_PROMOTIONS: Record<number, PlanPromotion> = {};

export function getPlanPromotion(planId: number, language: string): { recommended: boolean; highlights: string[] } {
  const promotion = PLAN_PROMOTIONS[planId];
  return {
    recommended: promotion?.recommended === true,
    highlights: (language === 'zh' ? promotion?.highlights?.zh : promotion?.highlights?.en) ?? [],
  };
}
