/**
 * Deterministic text layout — a line-by-line port of backend/app/services/text_layout.py.
 *
 * *** Keep in sync with the Python version (same algorithm, same operation order). ***
 *
 * Measurements use font-unit advance widths from `GET /fonts/{id}/metrics`, never the browser's text
 * measurement, so line breaks, auto-shrunk sizes and glyph positions match the Pillow renderer exactly.
 * All lengths are in template pixels.
 */

export const EPS = 0.01;
export const SHRINK_STEP_PT = 0.5;

export interface FontMetrics {
  units_per_em: number;
  ascender: number;
  descender: number;
  notdef_advance: number;
  advances: Map<number, number>;
}

export interface FontMetricsJson {
  units_per_em: number;
  ascender: number;
  descender: number;
  notdef_advance: number;
  advances: Record<string, number>;
}

export function parseMetrics(json: FontMetricsJson): FontMetrics {
  const advances = new Map<number, number>();
  for (const [k, v] of Object.entries(json.advances)) advances.set(Number(k), v);
  return { ...json, advances };
}

export interface Glyph {
  char: string;
  x: number;
  /** 0 = primary font, 1 = fallback font */
  font: 0 | 1;
}

export interface Line {
  text: string;
  width: number;
  x: number;
  baseline: number;
  glyphs: Glyph[];
}

export interface TextLayout {
  sizePx: number;
  lineHeightPx: number;
  lines: Line[];
  overflow: boolean;
  missing: string[];
}

export interface LayoutParams {
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  sizePx: number;
  minSizePx: number;
  stepPx: number;
  letterSpacingPx?: number;
  lineHeight?: number;
  wrap?: boolean;
  autoShrink?: boolean;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
}

/** Python iterates strings by code point; so must we (not UTF-16 units). */
const chars = (s: string): string[] => Array.from(s);
const cp = (ch: string): number => ch.codePointAt(0)!;

/** Unicode category Cc (control characters). */
export function isIgnorable(ch: string): boolean {
  const c = cp(ch);
  return c <= 0x1f || (c >= 0x7f && c <= 0x9f);
}

export class Measurer {
  constructor(
    readonly primary: FontMetrics,
    readonly fallback: FontMetrics | null = null,
  ) {}

  pick(ch: string): 0 | 1 {
    const c = cp(ch);
    if (this.primary.advances.has(c)) return 0;
    if (this.fallback && this.fallback.advances.has(c)) return 1;
    return 0;
  }

  advance(ch: string, sizePx: number): number {
    const c = cp(ch);
    const p = this.primary.advances.get(c);
    if (p !== undefined) return (p * sizePx) / this.primary.units_per_em;
    const f = this.fallback?.advances.get(c);
    if (f !== undefined && this.fallback) return (f * sizePx) / this.fallback.units_per_em;
    return (this.primary.notdef_advance * sizePx) / this.primary.units_per_em;
  }

  width(text: string, sizePx: number, letterSpacingPx: number): number {
    let w = 0;
    let n = 0;
    for (const ch of chars(text)) {
      w += this.advance(ch, sizePx);
      n += 1;
    }
    if (n > 1) w += letterSpacingPx * (n - 1);
    return w;
  }

  missing(text: string): string[] {
    const out: string[] = [];
    for (const ch of chars(text)) {
      if (isIgnorable(ch) || out.includes(ch)) continue;
      const c = cp(ch);
      if (!this.primary.advances.has(c) && !(this.fallback && this.fallback.advances.has(c))) out.push(ch);
    }
    return out;
  }
}

export function breakLines(m: Measurer, text: string, sizePx: number, lsPx: number, maxW: number, wrap: boolean): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (!wrap) {
      out.push(para);
      continue;
    }
    let line: string | null = null;
    for (const word of para.split(" ")) {
      const cand: string = line === null ? word : line + " " + word;
      if (m.width(cand, sizePx, lsPx) <= maxW + EPS) {
        line = cand;
        continue;
      }
      if (line !== null) {
        out.push(line);
        line = null;
      }
      if (m.width(word, sizePx, lsPx) <= maxW + EPS) {
        line = word;
        continue;
      }
      let chunk = "";
      for (const ch of chars(word)) {
        if (chunk !== "" && m.width(chunk + ch, sizePx, lsPx) > maxW + EPS) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    if (line !== null) out.push(line);
  }
  return out;
}

export function layoutText(text: string, p: LayoutParams, primary: FontMetrics, fallback: FontMetrics | null = null): TextLayout {
  const m = new Measurer(primary, fallback);
  const lsBase = p.letterSpacingPx ?? 0;
  const lineHeight = p.lineHeight ?? 1.2;
  const wrap = p.wrap ?? false;
  let size = p.sizePx;
  const minSize = p.autoShrink ? Math.min(p.minSizePx, size) : size;
  let lines: string[];
  let lineH: number;
  let ls: number;
  let fits: boolean;
  for (;;) {
    ls = (lsBase * size) / p.sizePx;
    lines = breakLines(m, text, size, ls, p.boxW, wrap);
    lineH = size * lineHeight;
    let widest = 0;
    for (const ln of lines) {
      const w = m.width(ln, size, ls);
      if (w > widest) widest = w;
    }
    fits = widest <= p.boxW + EPS && lines.length * lineH <= p.boxH + EPS;
    if (fits || size <= minSize + 1e-9) break;
    size = Math.max(minSize, size - p.stepPx);
  }

  const blockH = lines.length * lineH;
  let y0: number;
  if (p.valign === "middle") y0 = p.boxY + (p.boxH - blockH) / 2;
  else if (p.valign === "bottom") y0 = p.boxY + p.boxH - blockH;
  else y0 = p.boxY;
  const asc = (primary.ascender * size) / primary.units_per_em;
  const desc = (primary.descender * size) / primary.units_per_em;
  const baselineOff = (lineH - (asc + desc)) / 2 + asc;

  const out: Line[] = lines.map((textLine, i) => {
    const w = m.width(textLine, size, ls);
    let x: number;
    if (p.align === "center") x = p.boxX + (p.boxW - w) / 2;
    else if (p.align === "right") x = p.boxX + p.boxW - w;
    else x = p.boxX;
    const glyphs: Glyph[] = [];
    let gx = x;
    for (const ch of chars(textLine)) {
      glyphs.push({ char: ch, x: gx, font: m.pick(ch) });
      gx += m.advance(ch, size) + ls;
    }
    return { text: textLine, width: w, x, baseline: y0 + i * lineH + baselineOff, glyphs };
  });

  return { sizePx: size, lineHeightPx: lineH, lines: out, overflow: !fits, missing: m.missing(text) };
}
