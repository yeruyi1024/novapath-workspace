export interface MaasBillingDisplay {
  type: 'USD' | 'CNY' | 'CUSTOM' | 'TOKENS';
  quotaPerUnit: number;
  exchangeRate: number;
  symbol: string;
}

export interface MaasBillingSnapshot {
  accountId: number;
  quota: number;
  usedQuota: number;
  requestCount: number;
  display: MaasBillingDisplay;
  syncedAt: number;
}

/** Read the site's display conversion, never its recharge purchase price. */
export function parseMaasBillingDisplay(value: unknown): MaasBillingDisplay {
  const data = value as Record<string, unknown> | null;
  if (!data) throw new Error('invalidResponse');
  const type = data.quota_display_type ?? (data.display_in_currency === false ? 'TOKENS' : 'USD');
  if (typeof type !== 'string' || !['USD', 'CNY', 'CUSTOM', 'TOKENS'].includes(type)) throw new Error('invalidResponse');
  const positive = (raw: unknown) => {
    const number = typeof raw === 'string' && raw.trim() ? Number(raw) : raw;
    if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) throw new Error('invalidResponse');
    return number;
  };
  const quotaPerUnit = positive(data.quota_per_unit);
  const exchangeRate = type === 'CNY' ? positive(data.usd_exchange_rate)
    : type === 'CUSTOM' ? positive(data.custom_currency_exchange_rate) : 1;
  const symbol = type === 'CNY' ? '¥' : type === 'USD' ? '$'
    : type === 'CUSTOM' && typeof data.custom_currency_symbol === 'string' ? data.custom_currency_symbol.trim() : '';
  if (type === 'CUSTOM' && (!symbol || symbol.length > 32)) throw new Error('invalidResponse');
  return { type: type as MaasBillingDisplay['type'], quotaPerUnit, exchangeRate, symbol };
}

export function parseMaasBillingSnapshot(user: unknown, status: unknown, accountId: number, syncedAt = Date.now()): MaasBillingSnapshot {
  const data = user as Record<string, unknown> | null;
  if (!data || data.id !== accountId || !Number.isSafeInteger(accountId) || accountId <= 0
    || !Number.isSafeInteger(data.quota) || !Number.isSafeInteger(data.used_quota)
    || Number(data.used_quota) < 0 || !Number.isSafeInteger(data.request_count) || Number(data.request_count) < 0) {
    throw new Error('invalidResponse');
  }
  return { accountId, quota: Number(data.quota), usedQuota: Number(data.used_quota),
    requestCount: Number(data.request_count), display: parseMaasBillingDisplay(status), syncedAt };
}

/** Match platform wallet precision: up to 2 decimals, 4 for amounts below 1. */
export function formatMaasQuota(quota: number, display: MaasBillingDisplay, locale: string): string {
  if (display.type === 'TOKENS') return quota.toLocaleString(locale);
  const amount = quota / display.quotaPerUnit * display.exchangeRate;
  const digits = Math.abs(amount) >= 1 ? 2 : 4;
  // Keep tiny non-zero consumption visible, as the platform wallet does.
  const visible = amount !== 0 && Math.abs(amount) < 10 ** -digits ? Math.sign(amount) * 10 ** -digits : amount;
  if (display.type === 'CNY' || display.type === 'USD') {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: display.type, currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0, maximumFractionDigits: digits }).format(visible);
  }
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(visible);
  return `${display.symbol} ${number}`;
}
