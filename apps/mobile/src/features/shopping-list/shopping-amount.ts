/** Match the Shopping API's positive decimal, fraction, and mixed-fraction forms. */
export function shoppingAmountError(value: string): string | null {
  const amount = value.trim();
  if (!amount) return null;
  if (/^\d+(?:\.\d+)?$/u.test(amount)) return Number(amount) > 0 ? null : 'Enter an amount greater than zero.';
  const mixed = amount.match(/^(\d+)\s+(\d+)\/(\d+)$/u);
  const fraction = amount.match(/^(\d+)\/(\d+)$/u);
  const parts = mixed ?? fraction;
  if (!parts) return 'Enter a positive number or fraction, such as 2 2/3.';
  const numerator = Number(mixed ? parts[2] : parts[1]);
  const denominator = Number(mixed ? parts[3] : parts[2]);
  if (denominator <= 0 || numerator <= 0) return 'Enter an amount greater than zero.';
  return null;
}
