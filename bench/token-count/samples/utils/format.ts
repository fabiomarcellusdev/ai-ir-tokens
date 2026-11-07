/**
 * Formatting helpers shared by the UI and the emails.
 */

const priceFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats an amount in cents as a price, for example 1250 -> "$12.50".
 * Formatters are cached per currency because creating one is slow.
 */
export function formatPrice(cents: number, currency = "USD", locale = "en-US"): string {
  const key = `${locale}:${currency}`;
  let formatter = priceFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: "currency", currency });
    priceFormatters.set(key, formatter);
  }
  return formatter.format(cents / 100);
}

/**
 * Returns a relative time such as "3 minutes ago" or "in 2 days".
 */
export function formatRelative(date: Date, now: Date = new Date(), locale = "en-US"): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return rtf.format(0, "second");
}

/** Shortens text to at most `max` characters, adding an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

/** Converts "Hello World!" into "hello-world". */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Formats a byte count, for example 1536 -> "1.5 KB". */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(exponent === 0 ? 0 : decimals)} ${units[exponent]}`;
}
