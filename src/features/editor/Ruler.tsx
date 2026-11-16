import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export const RULER_SIZE = 20;

/** Millimetre ruler. `offset` is the screen position of 0 mm, `pxPerMm` the screen scale. */
export function Ruler({
  orientation,
  length,
  offset,
  pxPerMm,
  className,
  style,
}: {
  orientation: "h" | "v";
  length: number;
  offset: number;
  pxPerMm: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const horizontal = orientation === "h";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = horizontal ? length : RULER_SIZE;
    const h = horizontal ? RULER_SIZE : length;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#94a3b8";
    ctx.fillStyle = "#475569";
    ctx.font = "9px system-ui, sans-serif";
    ctx.lineWidth = 1;

    // Choose a label step so labels are at least ~50 px apart.
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const major = steps.find((s) => s * pxPerMm >= 50) ?? 1000;
    const minor = steps.slice().reverse().find((s) => s < major && s * pxPerMm >= 5 && major % s === 0);
    const start = Math.floor(-offset / pxPerMm / major) * major;
    const end = (length - offset) / pxPerMm;

    ctx.beginPath();
    for (let mm = start; mm <= end; mm += minor ?? major) {
      const p = Math.round(offset + mm * pxPerMm) + 0.5;
      const isMajor = Math.abs(mm / major - Math.round(mm / major)) < 1e-6;
      const len = isMajor ? RULER_SIZE : RULER_SIZE * 0.3;
      if (horizontal) {
        ctx.moveTo(p, RULER_SIZE);
        ctx.lineTo(p, RULER_SIZE - len);
      } else {
        ctx.moveTo(RULER_SIZE, p);
        ctx.lineTo(RULER_SIZE - len, p);
      }
      if (isMajor) {
        const label = String(Math.round(mm));
        if (horizontal) ctx.fillText(label, p + 2, 9);
        else {
          ctx.save();
          ctx.translate(9, p + 2);
          ctx.rotate(Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.stroke();
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(0, RULER_SIZE - 0.5);
      ctx.lineTo(w, RULER_SIZE - 0.5);
    } else {
      ctx.moveTo(RULER_SIZE - 0.5, 0);
      ctx.lineTo(RULER_SIZE - 0.5, h);
    }
    ctx.stroke();
  }, [horizontal, length, offset, pxPerMm]);

  return (
    <canvas
      ref={ref}
      className={cn("z-10", className)}
      style={{ ...style, width: horizontal ? length : RULER_SIZE, height: horizontal ? RULER_SIZE : length }}
      aria-hidden
    />
  );
}
