import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileImage, Loader2, RectangleHorizontal, RectangleVertical, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, unwrap } from "@/api/client";
import { qk } from "@/api/hooks";
import type { BlankTemplateCreate } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NumberInput } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SwitchField } from "@/components/ui/switch";
import { Segmented } from "@/components/ui/tabs";
import { ColorInput } from "@/features/editor/PlaceholderPanel";
import { ACCEPT_IMAGES_PDF, uploadImage } from "@/features/editor/LayerPanels";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "id", label: "ID card (85.6 × 54 mm)", w: 85.6, h: 54 },
  { id: "a6", label: "A6 (105 × 148 mm)", w: 105, h: 148 },
  { id: "a5", label: "A5 (148 × 210 mm)", w: 148, h: 210 },
  { id: "custom", label: "Custom size", w: 0, h: 0 },
] as const;

/** Create a template from a file (image or PDF): uploaded, then placed as an editable image layer on a canvas of its size. */
export function useCreateFromFile() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async (file: File) => {
      const info = await uploadImage(file);
      const name = file.name.replace(/\.[^.]+$/, "") || "New template";
      return unwrap(api.POST("/api/v1/templates/blank", { body: { name, description: "", image_ref: info.ref, image_name: name, background: null, width_mm: 85.6, height_mm: 54, dpi: 300 } }));
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: qk.templates });
      navigate(`/templates/${t.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function NewTemplateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"blank" | "file">("blank");
  const [preset, setPreset] = useState<string>("id");
  const [form, setForm] = useState({ name: "Untitled design", width: 85.6, height: 54, dpi: 300, background: "#ffffff" as string | null });
  const [over, setOver] = useState(false);
  const fromFile = useCreateFromFile();

  const blank = useMutation({
    mutationFn: () => {
      const body: BlankTemplateCreate = {
        name: form.name.trim() || "Untitled design",
        description: "",
        width_mm: form.width,
        height_mm: form.height,
        dpi: form.dpi,
        background: form.background,
      };
      return unwrap(api.POST("/api/v1/templates/blank", { body }));
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: qk.templates });
      onOpenChange(false);
      navigate(`/templates/${t.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const landscape = form.width >= form.height;
  const setOrientation = (l: boolean) => {
    if (l !== landscape) setForm((f) => ({ ...f, width: f.height, height: f.width }));
  };
  const pickPreset = (id: string) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p && p.w) setForm((f) => ({ ...f, ...(landscape === p.w >= p.h || p.w === p.h ? { width: p.w, height: p.h } : { width: p.h, height: p.w }) }));
  };
  const sizeOk = form.width > 0 && form.height > 0 && form.width <= 2000 && form.height <= 2000 && form.dpi >= 50 && form.dpi <= 1200;
  const px = (mm: number) => Math.round((mm / 25.4) * form.dpi);
  const busy = blank.isPending || fromFile.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Start from an empty canvas, or from an existing design (image or PDF) that becomes an editable layer.</DialogDescription>
        </DialogHeader>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "blank", label: "Blank canvas" },
            { value: "file", label: "From image or PDF" },
          ]}
          className="justify-self-start"
        />
        {mode === "blank" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Size" className="col-span-2">
              <div className="flex gap-2">
                <Select value={preset} onChange={(e) => pickPreset(e.target.value)} className="flex-1">
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
                <Button size="icon" variant={landscape ? "secondary" : "outline"} onClick={() => setOrientation(true)} aria-label="Landscape" title="Landscape">
                  <RectangleHorizontal />
                </Button>
                <Button size="icon" variant={!landscape ? "secondary" : "outline"} onClick={() => setOrientation(false)} aria-label="Portrait" title="Portrait">
                  <RectangleVertical />
                </Button>
              </div>
            </Field>
            <Field label="Width (mm)">
              <NumberInput value={form.width} min={1} max={2000} step={0.1} onChange={(v) => (setPreset("custom"), setForm((f) => ({ ...f, width: v })))} />
            </Field>
            <Field label="Height (mm)">
              <NumberInput value={form.height} min={1} max={2000} step={0.1} onChange={(v) => (setPreset("custom"), setForm((f) => ({ ...f, height: v })))} />
            </Field>
            <Field label="Resolution (DPI)" hint={sizeOk ? `${px(form.width)} × ${px(form.height)} px` : undefined}>
              <NumberInput value={form.dpi} min={50} max={1200} step={50} onChange={(v) => setForm((f) => ({ ...f, dpi: v }))} />
            </Field>
            <div className="flex flex-col gap-2">
              <SwitchField label="Background colour" checked={form.background !== null} onChange={(v) => setForm((f) => ({ ...f, background: v ? "#ffffff" : null }))} />
              {form.background !== null ? <ColorInput value={form.background} onChange={(v) => setForm((f) => ({ ...f, background: v }))} /> : <p className="text-xs text-muted-foreground">Transparent</p>}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => (e.preventDefault(), e.stopPropagation(), setOver(true))}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) fromFile.mutate(f);
            }}
            disabled={busy}
            className={cn(
              "flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-6 text-center transition-colors hover:border-primary/60 hover:bg-primary-soft/40",
              over && "border-primary bg-primary-soft/40",
            )}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              {fromFile.isPending ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}
            </span>
            <span className="font-bold text-heading">Choose or drop a file</span>
            <span className="max-w-72 text-xs text-muted-foreground">
              PNG, JPEG, TIFF, WebP or PDF (first page, rendered at 300 DPI). The card takes the file's size; the design becomes an image layer you can move, resize or replace.
            </span>
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT_IMAGES_PDF}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) fromFile.mutate(f);
            e.target.value = "";
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          {mode === "blank" ? (
            <Button onClick={() => blank.mutate()} disabled={!sizeOk || busy}>
              {blank.isPending && <Loader2 className="animate-spin" />} Create blank template
            </Button>
          ) : (
            <Button onClick={() => fileInput.current?.click()} disabled={busy}>
              {fromFile.isPending ? <Loader2 className="animate-spin" /> : <FileImage />} Choose file…
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
