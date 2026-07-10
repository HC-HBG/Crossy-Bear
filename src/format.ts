const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Thousands-separated, always 2 decimals (e.g. 1000010.9 -> "1,000,010.90"). Used for every currency amount. */
export function formatCurrency(value: number): string {
  return numberFormatter.format(value);
}

/** Same numeric formatting as currency, with a trailing "x" — used for every multiplier readout. */
export function formatMultiplier(value: number): string {
  return `${numberFormatter.format(value)}x`;
}
