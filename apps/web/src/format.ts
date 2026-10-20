const nf = (decimals: number) =>
  new Intl.NumberFormat('nb-NO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: false });
const cache = new Map<number, Intl.NumberFormat>();

/** Norsk tallformat med komma som desimaltegn, uten tusenskille. */
export function fmt(n: number, decimals = 3): string {
  let f = cache.get(decimals);
  if (!f) cache.set(decimals, (f = nf(decimals)));
  // Unngå «-0,000».
  const s = f.format(n).replace('−', '-');
  return /^-0[,.]?0*$/.test(s) ? s.slice(1) : s;
}

export const fmtM = (n: number, decimals = 3) => `${fmt(n, decimals)} m`;
export const radToDeg = (r: number) => (r * 180) / Math.PI;
export const degToRad = (d: number) => (d * Math.PI) / 180;
export const fmtDeg = (rad: number, decimals = 3) => `${fmt(radToDeg(rad), decimals)}°`;

/**
 * Leser et tall fra brukerinput. Tillater komma eller punktum som desimaltegn og mellomrom
 * som tusenskille. Gir null for tomt/ugyldig/uendelig – aldri en stille gjetning.
 */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
