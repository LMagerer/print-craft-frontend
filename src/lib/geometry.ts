/** Placeholder geometry helpers: canvas pixels <-> template mm, snapping and alignment guides. */

export interface RectMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const snapTo = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round3 = (v: number) => Math.round(v * 1000) / 1000;

export interface Guide {
  orientation: "v" | "h";
  /** position in mm */
  pos: number;
}

export interface SnapResult {
  x: number;
  y: number;
  guides: Guide[];
}

/**
 * Convert a dragged position (template pixels) to mm, snapping to a grid and to edges/centres of the card,
 * the safe area (inside bleed) and other placeholders. `tolMm` is the snap distance.
 */
export function snapPosition(
  xPx: number,
  yPx: number,
  pxPerMm: number,
  size: { w: number; h: number },
  card: { w: number; h: number; bleed: number },
  others: readonly RectMm[],
  opts: { grid: number; tolMm: number; snap: boolean },
): SnapResult {
  let x = xPx / pxPerMm;
  let y = yPx / pxPerMm;
  const guides: Guide[] = [];
  if (!opts.snap) return { x: round3(x), y: round3(y), guides };

  const vTargets = [0, card.bleed, card.w / 2, card.w - card.bleed, card.w];
  const hTargets = [0, card.bleed, card.h / 2, card.h - card.bleed, card.h];
  for (const o of others) {
    vTargets.push(o.x, o.x + o.w / 2, o.x + o.w);
    hTargets.push(o.y, o.y + o.h / 2, o.y + o.h);
  }

  const best = (start: number, len: number, targets: number[]) => {
    let found: { delta: number; target: number } | null = null;
    for (const edge of [start, start + len / 2, start + len]) {
      for (const t of targets) {
        const d = t - edge;
        if (Math.abs(d) <= opts.tolMm && (!found || Math.abs(d) < Math.abs(found.delta))) found = { delta: d, target: t };
      }
    }
    return found;
  };

  const bx = best(x, size.w, vTargets);
  if (bx) {
    x += bx.delta;
    guides.push({ orientation: "v", pos: bx.target });
  } else x = snapTo(x, opts.grid);
  const by = best(y, size.h, hTargets);
  if (by) {
    y += by.delta;
    guides.push({ orientation: "h", pos: by.target });
  } else y = snapTo(y, opts.grid);
  return { x: round3(x), y: round3(y), guides };
}
