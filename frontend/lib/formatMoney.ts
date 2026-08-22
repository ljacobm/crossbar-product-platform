// No shared money formatter existed anywhere in the app before this
// feature (existing code inlines `$${Number(x).toFixed(2)}` per-component,
// with no thousands separator) -- sales dashboard totals routinely run into
// the thousands, so a proper `$1,234.56`-style formatter is worth the one
// small shared function rather than repeating an under-formatted inline
// version at every call site.
export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}
