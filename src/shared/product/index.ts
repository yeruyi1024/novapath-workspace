import config from './product.json';

/** Public distribution settings only. Never put credentials in this file. */
export const PRODUCT = config;
export const PRODUCT_FEATURES = config.features;
export const PRODUCT_SERVICES = config.services;

export function formatProductText(text: string): string {
  return text.split('{productName}').join(PRODUCT.name)
    .split('{englishName}').join(PRODUCT.englishName);
}
