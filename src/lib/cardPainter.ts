/**
 * Canvas preview of placeholder text, mirroring CardRenderer.layout/_draw in the backend.
 *
 * The layout (line breaks, final size, glyph positions) comes from `layoutText` with the same font metrics as
 * Pillow, so only rasterisation differs between this preview and the final render.
 * The context passed to `paintPlaceholder` must use template pixels as user units.
 */
import type { Placeholder, Record_, TemplateConfig } from "@/api/types";
import { toCss } from "./color";
import { cssFamily, type FontLibrary } from "./fonts";
import { layoutText, SHRINK_STEP_PT, type FontMetrics, type TextLayout } from "./textLayout";
import { applyTransform, bindingFields, resolveBinding } from "./tokens";
import { ptToPx, templateScale } from "./units";

export interface Scale {
  pxPerMm: number;
  dpi: number;
}

export interface PreparedText {
  placeholder: Placeholder;
  text: string;
  layout: TextLayout;
  primaryId: number;
  fallbackId: number | null;
  sizePt: number;
  missingFields: string[];
}

export function scaleFor(config: TemplateConfig, imageWidthPx: number): Scale {
  return templateScale(imageWidthPx, config.size.width_mm);
}

/** Font ids (after bold/italic resolution) needed to draw the config. */
export function requiredFontIds(config: TemplateConfig, lib: FontLibrary): number[] {
  const ids = new Set<number>();
  for (const p of config.placeholders) {
    const f = p.font;
    const primary = lib.resolve(f.font_id, f.bold, f.italic);
    if (primary) ids.add(primary.id);
    if (f.fallback_font_id != null) {
      const fb = lib.resolve(f.fallback_font_id, f.bold, f.italic);
      if (fb) ids.add(fb.id);
    }
  }
  return [...ids];
}

export function prepareText(
  p: Placeholder,
  record: Record_ | null,
  scale: Scale,
  lib: FontLibrary,
  metrics: ReadonlyMap<number, FontMetrics>,
): PreparedText | null {
  const f = p.font;
  const primary = lib.resolve(f.font_id, f.bold, f.italic);
  if (!primary) return null;
  const pm = metrics.get(primary.id);
  if (!pm) return null;
  const fallback = f.fallback_font_id != null ? lib.resolve(f.fallback_font_id, f.bold, f.italic) : null;
  const fm = fallback ? (metrics.get(fallback.id) ?? null) : null;

  const text = applyTransform(resolveBinding(p.binding, record, p.sample_text), f.transform);
  const { pxPerMm, dpi } = scale;
  const sizePx = ptToPx(f.size_pt, dpi);
  const layout = layoutText(
    text,
    {
      boxX: p.x_mm * pxPerMm,
      boxY: p.y_mm * pxPerMm,
      boxW: p.box.width_mm * pxPerMm,
      boxH: p.box.height_mm * pxPerMm,
      sizePx,
      minSizePx: f.min_size_pt ? ptToPx(f.min_size_pt, dpi) : sizePx,
      stepPx: ptToPx(SHRINK_STEP_PT, dpi),
      letterSpacingPx: ptToPx(f.letter_spacing, dpi),
      lineHeight: f.line_height,
      wrap: f.wrap,
      autoShrink: f.auto_shrink,
      align: p.align,
      valign: p.valign,
    },
    pm,
    fm,
  );
  const missingFields = record === null ? [] : bindingFields(p.binding).filter((k) => !(k in record));
  return {
    placeholder: p,
    text,
    layout,
    primaryId: primary.id,
    fallbackId: fallback && fm ? fallback.id : null,
    sizePt: (layout.sizePx * 72) / dpi,
    missingFields,
  };
}

const isSpace = (ch: string) => /\s/u.test(ch);
const OFFSCREEN = 100000;

function eachGlyph(prep: PreparedText, ctx: CanvasRenderingContext2D, draw: (ch: string, x: number, y: number) => void) {
  const size = prep.layout.sizePx;
  const fonts = [`${size}px "${cssFamily(prep.primaryId)}"`, `${size}px "${cssFamily(prep.fallbackId ?? prep.primaryId)}"`];
  let current = -1;
  for (const ln of prep.layout.lines) {
    for (const g of ln.glyphs) {
      if (isSpace(g.char)) continue;
      if (g.font !== current) {
        ctx.font = fonts[g.font];
        current = g.font;
      }
      draw(g.char, g.x, ln.baseline);
    }
  }
}

/** Draw shadow, then stroke, then fill — the same order and geometry as the Pillow renderer. */
export function paintText(ctx: CanvasRenderingContext2D, prep: PreparedText, scale: Scale) {
  if (!prep.layout.lines.length) return;
  const f = prep.placeholder.font;
  const strokePx = ptToPx(f.stroke_width_pt, scale.dpi);
  const sh = f.shadow;
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineWidth = strokePx * 2;
  // FontFace registrations have no synthetic bold/italic; variants are separate files.
  (ctx as CanvasRenderingContext2D & { fontKerning?: string }).fontKerning = "none";

  const outline = (ch: string, x: number, y: number) => {
    if (strokePx > 0) ctx.strokeText(ch, x, y);
    ctx.fillText(ch, x, y);
  };

  if (sh.enabled) {
    // Shadow offset/blur are in device pixels and ignore the transform: draw the glyphs far away and
    // project only their shadow back, so the shadow can be blurred without drawing the glyph itself.
    const m = ctx.getTransform();
    const s = Math.hypot(m.a, m.b) || 1;
    ctx.save();
    ctx.shadowColor = toCss(sh.color);
    ctx.shadowBlur = sh.blur_mm * scale.pxPerMm * s;
    ctx.shadowOffsetX = (OFFSCREEN + sh.offset_x_mm * scale.pxPerMm) * s;
    ctx.shadowOffsetY = sh.offset_y_mm * scale.pxPerMm * s;
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#000";
    eachGlyph(prep, ctx, (ch, x, y) => outline(ch, x - OFFSCREEN, y));
    ctx.restore();
  }
  if (strokePx > 0) {
    ctx.fillStyle = ctx.strokeStyle = toCss(f.stroke_color);
    eachGlyph(prep, ctx, outline);
  }
  ctx.fillStyle = toCss(f.color);
  eachGlyph(prep, ctx, (ch, x, y) => ctx.fillText(ch, x, y));
  ctx.restore();
}

/** Render a whole card into a 2D context (used for thumbnails / tests). */
export function paintCard(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource & { width: number },
  config: TemplateConfig,
  record: Record_ | null,
  lib: FontLibrary,
  metrics: ReadonlyMap<number, FontMetrics>,
) {
  const scale = scaleFor(config, image.width);
  ctx.drawImage(image, 0, 0);
  for (const p of config.placeholders) {
    if (p.hidden) continue;
    const prep = prepareText(p, record, scale, lib, metrics);
    if (prep) paintText(ctx, prep, scale);
  }
}
