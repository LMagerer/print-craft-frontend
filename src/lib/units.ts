/** Physical units. Mirrors backend/app/core/units.py — all stored lengths are millimetres. */

export type Unit = "mm" | "cm" | "in" | "px" | "pt";

export const MM_PER_INCH = 25.4;
export const PT_PER_INCH = 72;

export function toMm(value: number, unit: Unit, dpi?: number): number {
  switch (unit) {
    case "mm":
      return value;
    case "cm":
      return value * 10;
    case "in":
      return value * MM_PER_INCH;
    case "pt":
      return (value * MM_PER_INCH) / PT_PER_INCH;
    case "px":
      if (!dpi || dpi <= 0) throw new Error("DPI is required to convert pixels");
      return (value * MM_PER_INCH) / dpi;
  }
}

export function fromMm(valueMm: number, unit: Unit, dpi?: number): number {
  switch (unit) {
    case "mm":
      return valueMm;
    case "cm":
      return valueMm / 10;
    case "in":
      return valueMm / MM_PER_INCH;
    case "pt":
      return (valueMm * PT_PER_INCH) / MM_PER_INCH;
    case "px":
      if (!dpi || dpi <= 0) throw new Error("DPI is required to convert pixels");
      return (valueMm * dpi) / MM_PER_INCH;
  }
}

export const mmToPx = (mm: number, dpi: number) => (mm * dpi) / MM_PER_INCH;
export const pxToMm = (px: number, dpi: number) => (px * MM_PER_INCH) / dpi;
export const ptToPx = (pt: number, dpi: number) => (pt * dpi) / PT_PER_INCH;
export const dpiFor = (pixels: number, sizeMm: number) => pixels / (sizeMm / MM_PER_INCH);
export const pixelsFor = (sizeMm: number, dpi: number) => Math.max(1, Math.round((sizeMm / MM_PER_INCH) * dpi));

/** Template pixel scale, identical to the backend renderer: image width / configured width in mm. */
export function templateScale(widthPx: number, widthMm: number) {
  const pxPerMm = widthPx / widthMm;
  return { pxPerMm, dpi: pxPerMm * MM_PER_INCH };
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

export function formatLength(mm: number, unit: Unit, dpi?: number, digits = 2): string {
  return `${round(fromMm(mm, unit, dpi), digits)} ${unit}`;
}

export function sizeSummary(widthMm: number, heightMm: number, widthPx: number, heightPx: number): string {
  const dpi = dpiFor(widthPx, widthMm);
  return `${widthMm.toFixed(1)} × ${heightMm.toFixed(1)} mm | ${widthPx} × ${heightPx} px | ${dpi.toFixed(0)} DPI`;
}
