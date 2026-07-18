const symbols: Record<string, string> = { gbp: "£" };

export function formatMoney(cents: number, currency = "gbp"): string {
  const symbol = symbols[currency] ?? "";
  const pounds = cents / 100;
  const formatted = pounds.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}`;
}

/** The single money renderer (dashboard-ui-patterns): integer cents in, formatted out. */
export function Money({
  cents,
  currency = "gbp",
  className,
}: {
  cents: number | null | undefined;
  currency?: string;
  className?: string;
}) {
  if (cents === null || cents === undefined) {
    return <span className={className}>—</span>;
  }
  return <span className={className}>{formatMoney(cents, currency)}</span>;
}
