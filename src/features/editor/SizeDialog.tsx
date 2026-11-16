import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, unwrap } from "@/api/client";
import { parseConfig, type TemplateConfig, type TemplateOut, type TransformRequest, type TransformResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NumberInput } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SwitchField } from "@/components/ui/switch";
import { dpiFor, fromMm, pixelsFor, round, toMm, type Unit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { ColorInput } from "./PlaceholderPanel";

export const SIZE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: "Credit card (ISO ID-1) 85.6 × 54", w: 85.6, h: 54 },
  { label: "Business card EU 85 × 55", w: 85, h: 55 },
  { label: "Business card US 88.9 × 50.8", w: 88.9, h: 50.8 },
  { label: "Badge 90 × 55", w: 90, h: 55 },
  { label: "Name tag 100 × 70", w: 100, h: 70 },
  { label: "A7 74 × 105", w: 74, h: 105 },
  { label: "A6 105 × 148", w: 105, h: 148 },
  { label: "A5 148 × 210", w: 148, h: 210 },
];

const MODES: { value: TransformRequest["mode"]; title: string; text: string }[] = [
  { value: "print_size_only", title: "Print size only", text: "Lossless. Changes only the physical size/DPI; pixels stay untouched. Aspect follows the image." },
  { value: "resample", title: "Resample", text: "Scales the pixels to exactly the target size at the target DPI (may distort if the aspect differs)." },
  { value: "crop_fit", title: "Crop / fit", text: "Keeps proportions: crops (cover) or pads (contain) to the target aspect, then resamples." },
];

const ANCHORS = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateOut;
  imageRef: string;
  config: TemplateConfig;
  /** Called with the new image ref and remapped config after the user applies the change. */
  onApplied: (imageRef: string, config: TemplateConfig, res: TransformResponse) => Promise<void> | void;
}

export function SizeDialog({ open, onOpenChange, template, imageRef, config, onApplied }: Props) {
  const [mode, setMode] = useState<TransformRequest["mode"]>("print_size_only");
  const [unit, setUnit] = useState<Unit>("mm");
  const trimW = config.size.width_mm - 2 * config.size.bleed_mm;
  const trimH = config.size.height_mm - 2 * config.size.bleed_mm;
  const [w, setW] = useState(config.size.width_mm);
  const [h, setH] = useState(config.size.height_mm);
  const [dpi, setDpi] = useState(Math.round(config.size.dpi) || 300);
  const [rotate, setRotate] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [anchor, setAnchor] = useState<(typeof ANCHORS)[number]>("center");
  const [padColor, setPadColor] = useState("#FFFFFF");
  const [bleed, setBleed] = useState(0);
  const [bleedFill, setBleedFill] = useState<"mirror" | "color">("mirror");
  const [flatten, setFlatten] = useState(false);
  const [background, setBackground] = useState("#FFFFFF");
  const [scalePlaceholders, setScalePlaceholders] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setW(config.size.width_mm);
      setH(config.size.height_mm);
      setDpi(Math.round(config.size.dpi) || 300);
      setWarnings([]);
    }
  }, [open, config.size]);

  const srcW = rotate % 180 ? template.height_px : template.width_px;
  const srcH = rotate % 180 ? template.width_px : template.height_px;

  // Client-side estimate of the result (the server is authoritative).
  const estimate = useMemo(() => {
    if (mode === "print_size_only") {
      const d = dpiFor(srcW, w);
      return { px: [srcW, srcH], dpi: d, mm: [w, (srcH / d) * 25.4] };
    }
    return { px: [pixelsFor(w, dpi), pixelsFor(h, dpi)], dpi, mm: [w, h] };
  }, [mode, srcW, srcH, w, h, dpi]);

  const bleedPx = Math.round((Math.abs(bleed) * estimate.dpi) / 25.4) * Math.sign(bleed);
  const finalPx = [estimate.px[0] + 2 * bleedPx, estimate.px[1] + 2 * bleedPx];
  const upscale = mode !== "print_size_only" && (estimate.px[0] > srcW * 1.01 || estimate.px[1] > srcH * 1.01);

  const apply = useMutation({
    mutationFn: async () => {
      const body: TransformRequest = {
        source_ref: imageRef,
        mode,
        width_mm: w,
        height_mm: h,
        target_dpi: dpi,
        rotate,
        flip_h: flipH,
        flip_v: flipV,
        crop: null,
        fit,
        anchor,
        pad_color: padColor,
        bleed_mm: bleed,
        bleed_fill: bleedFill,
        background: flatten ? background : null,
        config: config as TransformRequest["config"],
        scale_placeholders: scalePlaceholders,
      };
      return unwrap(api.POST("/api/v1/images/transform", { body }));
    },
    onSuccess: async (res) => {
      setWarnings(res.warnings);
      await onApplied(res.image.ref, parseConfig(res.config ?? config), res);
      toast.success(`Image updated: ${res.summary}`);
      for (const msg of res.warnings) toast.warning(msg);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const L = (mm: number) => round(fromMm(mm, unit, estimate.dpi), unit === "px" ? 0 : 3);
  const setFromUnit = (setter: (v: number) => void) => (v: number) => setter(round(toMm(v, unit, estimate.dpi), 4));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Image size & print format</DialogTitle>
          <DialogDescription>
            Current: {template.width_px} × {template.height_px} px · {round(config.size.width_mm, 2)} × {round(config.size.height_mm, 2)} mm ·{" "}
            {round(config.size.dpi, 0)} DPI{config.size.bleed_mm > 0 ? ` · bleed ${round(config.size.bleed_mm, 2)} mm (trim ${round(trimW, 2)} × ${round(trimH, 2)} mm)` : ""}. A new
            version is saved; the original image is never modified.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={cn("rounded-md border p-2 text-left text-xs", mode === m.value ? "border-primary bg-primary/5" : "hover:bg-accent")}
            >
              <div className="text-sm font-medium">{m.title}</div>
              <div className="text-muted-foreground">{m.text}</div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Field label="Preset" className="col-span-4">
            <Select
              value=""
              onChange={(e) => {
                const p = SIZE_PRESETS[Number(e.target.value)];
                if (!p) return;
                const landscape = srcW >= srcH;
                setW(landscape ? Math.max(p.w, p.h) : Math.min(p.w, p.h));
                setH(landscape ? Math.min(p.w, p.h) : Math.max(p.w, p.h));
              }}
            >
              <option value="">Choose a preset…</option>
              {SIZE_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label} mm
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Width (${unit})`}>
            <NumberInput value={L(w)} min={0.001} step={unit === "px" ? 1 : 0.1} onChange={setFromUnit(setW)} />
          </Field>
          <Field label={`Height (${unit})`} hint={mode === "print_size_only" ? "Follows the image aspect" : undefined}>
            <NumberInput value={L(mode === "print_size_only" ? estimate.mm[1] : h)} min={0.001} step={unit === "px" ? 1 : 0.1} onChange={setFromUnit(setH)} disabled={mode === "print_size_only"} />
          </Field>
          <Field label="Unit">
            <Select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {(["mm", "cm", "in", "pt", "px"] as Unit[]).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
          <Field label="Target DPI">
            <NumberInput value={mode === "print_size_only" ? round(estimate.dpi, 1) : dpi} min={1} max={4800} step={1} onChange={setDpi} disabled={mode === "print_size_only"} />
          </Field>
          {mode === "crop_fit" && (
            <>
              <Field label="Fit">
                <Select value={fit} onChange={(e) => setFit(e.target.value as "cover" | "contain")}>
                  <option value="cover">Cover (crop)</option>
                  <option value="contain">Contain (pad)</option>
                </Select>
              </Field>
              <Field label="Anchor">
                <Select value={anchor} onChange={(e) => setAnchor(e.target.value as (typeof ANCHORS)[number])}>
                  {ANCHORS.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </Select>
              </Field>
              {fit === "contain" && (
                <Field label="Pad colour" className="col-span-2">
                  <ColorInput value={padColor} onChange={setPadColor} />
                </Field>
              )}
            </>
          )}
          <Field label="Rotate">
            <Select value={rotate} onChange={(e) => setRotate(Number(e.target.value) as 0 | 90 | 180 | 270)}>
              <option value={0}>0°</option>
              <option value={90}>90° clockwise</option>
              <option value={180}>180°</option>
              <option value={270}>90° counter-clockwise</option>
            </Select>
          </Field>
          <div className="col-span-3 flex items-end gap-4 pb-1">
            <SwitchField label="Flip horizontally" checked={flipH} onChange={setFlipH} />
            <SwitchField label="Flip vertically" checked={flipV} onChange={setFlipV} />
          </div>
          <Field label="Bleed change (mm)" hint="Positive adds, negative trims on every side">
            <NumberInput value={bleed} min={-50} max={50} step={0.5} onChange={setBleed} />
          </Field>
          <Field label="Bleed fill">
            <Select value={bleedFill} onChange={(e) => setBleedFill(e.target.value as "mirror" | "color")} disabled={bleed <= 0}>
              <option value="mirror">Mirror edges</option>
              <option value="color">Pad colour</option>
            </Select>
          </Field>
          <div className="col-span-2 flex flex-col justify-end gap-2 pb-1">
            <SwitchField label="Flatten transparency" checked={flatten} onChange={setFlatten} />
          </div>
          {flatten && (
            <Field label="Background" className="col-span-2">
              <ColorInput value={background} onChange={setBackground} />
            </Field>
          )}
          <div className="col-span-4">
            <SwitchField label="Move placeholders with the image content" checked={scalePlaceholders} onChange={setScalePlaceholders} />
          </div>
        </div>

        <div className={cn("rounded-md border p-3 text-sm", upscale || estimate.dpi < 150 ? "border-warning bg-warning/5" : "bg-muted/50")}>
          <div className="font-medium">
            Result ≈ {round(estimate.mm[0] + 2 * (bleedPx * 25.4) / estimate.dpi, 2)} × {round(estimate.mm[1] + 2 * (bleedPx * 25.4) / estimate.dpi, 2)} mm | {finalPx[0]} × {finalPx[1]} px |{" "}
            {round(estimate.dpi, 0)} DPI
          </div>
          {upscale && <p className="text-xs text-warning-text">The image will be upscaled; it may look soft when printed.</p>}
          {estimate.dpi < 150 && <p className="text-xs text-warning-text">Low resolution for print (recommended ≥ 300 DPI, minimum 150).</p>}
          {warnings.map((m) => (
            <p key={m} className="text-xs text-warning-text">
              {m}
            </p>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => apply.mutate()} disabled={apply.isPending}>
            {apply.isPending ? "Applying…" : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
