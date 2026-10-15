import { afterEach, describe, expect, test } from 'vitest';

import { getPlanPromotion, PLAN_PROMOTIONS } from './platformPlanPromotion';

describe('plan promotion overlay', () => {
  afterEach(() => { delete PLAN_PROMOTIONS[7]; });

  test('renders nothing extra for unconfigured plans', () => {
    expect(getPlanPromotion(7, 'zh')).toEqual({ recommended: false, highlights: [] });
  });

  test('returns the configured mark and language-specific highlights', () => {
    PLAN_PROMOTIONS[7] = { recommended: true, highlights: { zh: ['甲'], en: ['A'] } };
    expect(getPlanPromotion(7, 'zh')).toEqual({ recommended: true, highlights: ['甲'] });
    expect(getPlanPromotion(7, 'en')).toEqual({ recommended: true, highlights: ['A'] });
  });
});
