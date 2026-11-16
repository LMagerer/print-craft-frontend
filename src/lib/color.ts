/** Colour parsing. Mirrors backend parse_color: #RGB, #RGBA, #RRGGBB, #RRGGBBAA, rgb()/rgba(). */
export type RGBA = [number, number, number, number];

export function parseColor(value: string): RGBA | null {
  const v = (value ?? "").trim();
  if (v.startsWith("#")) {
    let h = v.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length === 6) h += "ff";
    if (!/^[0-9a-fA-F]{8}$/.test(h)) return null;
    return [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGBA;
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(v);
  if (!m) return null;
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  return [Math.min(255, +m[1]), Math.min(255, +m[2]), Math.min(255, +m[3]), Math.max(0, Math.min(255, Math.round(a * 255)))];
}

export const isValidColor = (v: string) => parseColor(v) !== null;

export function toCss(value: string): string {
  const c = parseColor(value) ?? [0, 0, 0, 255];
  return `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(4)})`;
}

/** "#rrggbb" part for <input type=color>. */
export function toHex6(value: string): string {
  const c = parseColor(value) ?? [0, 0, 0, 255];
  return "#" + c.slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("");
}

/** Replace RGB, keep the existing alpha. */
export function withHex6(value: string, hex6: string): string {
  const c = parseColor(value);
  const alpha = c && c[3] !== 255 ? c[3].toString(16).padStart(2, "0") : "";
  return hex6 + alpha;
}
