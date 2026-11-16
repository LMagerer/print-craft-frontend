/** Font library mirror (backend FontLibrary) plus browser font loading for the canvas preview. */
import type { FontOut } from "@/api/types";
import { API_BASE, fileUrl } from "@/api/client";
import { parseMetrics, type FontMetrics, type FontMetricsJson } from "./textLayout";

export const DEFAULT_FAMILY = "Noto Sans";

export class FontLibrary {
  readonly byId = new Map<number, FontOut>();
  readonly byFamily = new Map<string, FontOut>();

  constructor(fonts: readonly FontOut[]) {
    const sorted = [...fonts].sort((a, b) => a.id - b.id);
    for (const f of sorted) {
      this.byId.set(f.id, f);
      const key = `${f.family.toLowerCase()}|${f.style}`;
      if (!this.byFamily.has(key)) this.byFamily.set(key, f);
    }
  }

  default(): FontOut | null {
    const f = this.byFamily.get(`${DEFAULT_FAMILY.toLowerCase()}|regular`);
    if (f) return f;
    const ids = [...this.byId.keys()];
    return ids.length ? this.byId.get(Math.min(...ids))! : null;
  }

  /** Same selection as FontLibrary.resolve in Python: bold/italic switch to the family's variant if it exists. */
  resolve(fontId: number | null | undefined, bold = false, italic = false): FontOut | null {
    const base = (fontId != null ? this.byId.get(fontId) : undefined) ?? this.default();
    if (!base || !(bold || italic)) return base;
    const wantBold = bold || base.style.includes("bold");
    const wantItalic = italic || base.style.includes("italic");
    const style = (wantBold ? "bold" : "") + (wantItalic ? "italic" : "") || "regular";
    return this.byFamily.get(`${base.family.toLowerCase()}|${style}`) ?? base;
  }

  families(): string[] {
    return [...new Set([...this.byId.values()].map((f) => f.family))].sort();
  }
}

const metricsCache = new Map<number, Promise<FontMetrics>>();
const faceCache = new Map<number, Promise<boolean>>();

export function loadMetrics(id: number): Promise<FontMetrics> {
  let p = metricsCache.get(id);
  if (!p) {
    p = fetch(`${API_BASE}/fonts/${id}/metrics`).then(async (r) => {
      if (!r.ok) throw new Error(`Font metrics ${id}: ${r.status}`);
      return parseMetrics((await r.json()) as FontMetricsJson);
    });
    p.catch(() => metricsCache.delete(id));
    metricsCache.set(id, p);
  }
  return p;
}

/** CSS family name under which a font file is registered. One name per font file; no synthetic styles. */
export const cssFamily = (id: number) => `tc-font-${id}`;

export function loadFontFace(id: number): Promise<boolean> {
  let p = faceCache.get(id);
  if (!p) {
    const face = new FontFace(cssFamily(id), `url(${fileUrl.font(id)})`);
    p = face.load().then(
      (f) => {
        document.fonts.add(f);
        return true;
      },
      () => false,
    );
    faceCache.set(id, p);
  }
  return p;
}

export async function loadFont(id: number): Promise<FontMetrics> {
  const [m] = await Promise.all([loadMetrics(id), loadFontFace(id)]);
  return m;
}
