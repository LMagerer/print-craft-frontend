import { useShallow } from "zustand/react/shallow";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Eye, EyeOff, Lock, Plus, Trash2, Unlock } from "lucide-react";
import type { Binding, FontConfig, Placeholder } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SwitchField } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import type { PreparedText } from "@/lib/cardPainter";
import { isValidColor, toHex6, withHex6 } from "@/lib/color";
import type { FontLibrary } from "@/lib/fonts";
import { tokenSyntaxErrors, validateTokens } from "@/lib/tokens";
import { fromMm, round, toMm, type Unit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editorStore";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

export function LengthInput({ mm, onChange, unit, dpi, min }: { mm: number; onChange: (mm: number) => void; unit: Unit; dpi: number; min?: number }) {
  const step = unit === "px" ? 1 : unit === "in" ? 0.01 : unit === "cm" ? 0.01 : 0.1;
  return (
    <div className="relative">
      <NumberInput
        value={round(fromMm(mm, unit, dpi), unit === "px" ? 1 : 3)}
        step={step}
        min={min !== undefined ? fromMm(min, unit, dpi) : undefined}
        onChange={(v) => onChange(round(toMm(v, unit, dpi), 4))}
        className="pr-7"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{unit}</span>
    </div>
  );
}

export function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const valid = isValidColor(value);
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={toHex6(value)}
        onChange={(e) => onChange(withHex6(value, e.target.value))}
        className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-background p-0.5"
        aria-label="Pick colour"
      />
      <Input value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!valid} className="font-mono text-xs" title="#RGB, #RRGGBB, #RRGGBBAA or rgba(r,g,b,a)" />
    </div>
  );
}

interface PanelProps {
  placeholder: Placeholder;
  prepared: PreparedText | undefined;
  lib: FontLibrary;
  fields: string[];
  unit: Unit;
  dpi: number;
}

const NO_PLACEHOLDERS: Placeholder[] = [];
const NO_PLACEHOLDERS_IDS: string[] = [];

export function PlaceholderPanel({ placeholder: p, prepared, lib, fields, unit, dpi }: PanelProps) {
  const update = useEditor((s) => s.updatePlaceholder);
  const remove = useEditor((s) => s.removePlaceholder);
  const duplicate = useEditor((s) => s.duplicatePlaceholder);
  const allIds = useEditor(useShallow((s) => s.config?.placeholders.map((q) => q.id) ?? NO_PLACEHOLDERS_IDS));

  const set = (patch: Partial<Placeholder>, key?: string) => update(p.id, patch, key ? `${p.id}:${key}` : undefined);
  const setFont = (patch: Partial<FontConfig>, key?: string) =>
    update(p.id, (q) => ({ ...q, font: { ...q.font, ...patch } }), key ? `${p.id}:font.${key}` : undefined);
  const setBinding = (patch: Partial<Binding>, key?: string) =>
    update(p.id, (q) => ({ ...q, binding: { ...q.binding, ...patch } }), key ? `${p.id}:binding.${key}` : undefined);
  const setShadow = (patch: Partial<FontConfig["shadow"]>, key?: string) =>
    update(p.id, (q) => ({ ...q, font: { ...q.font, shadow: { ...q.font.shadow, ...patch } } }), key ? `${p.id}:shadow.${key}` : undefined);

  const f = p.font;
  const base = lib.resolve(f.font_id);
  const resolved = lib.resolve(f.font_id, f.bold, f.italic);
  const wantStyle = (f.bold || base?.style.includes("bold") ? "bold" : "") + (f.italic || base?.style.includes("italic") ? "italic" : "") || "regular";
  const styleMissing = resolved && resolved.style !== wantStyle;
  const families = lib.families();
  const facesOf = (family: string) => [...lib.byId.values()].filter((x) => x.family === family);

  const unknownTokens = p.binding.mode === "template" ? validateTokens(p.binding.template ?? "", fields) : [];
  const syntaxErrors = p.binding.mode === "template" ? tokenSyntaxErrors(p.binding.template ?? "") : [];
  const fieldMissing = p.binding.mode === "field" && p.binding.field && fields.length > 0 && !fields.includes(p.binding.field);
  const idTaken = allIds.filter((id) => id === p.id).length > 1;

  return (
    <div className="text-sm">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <Input value={p.label} onChange={(e) => set({ label: e.target.value }, "label")} className="h-7 font-medium" aria-label="Label" />
        <Tip content={p.hidden ? "Show" : "Hide (not rendered)"}>
          <Button size="icon" variant="ghost" onClick={() => set({ hidden: !p.hidden })}>
            {p.hidden ? <EyeOff /> : <Eye />}
          </Button>
        </Tip>
        <Tip content={p.locked ? "Unlock" : "Lock position"}>
          <Button size="icon" variant="ghost" onClick={() => set({ locked: !p.locked })}>
            {p.locked ? <Lock /> : <Unlock />}
          </Button>
        </Tip>
        <Tip content="Duplicate (Ctrl+D)">
          <Button size="icon" variant="ghost" onClick={() => duplicate(p.id)}>
            <Copy />
          </Button>
        </Tip>
        <Tip content="Delete (Del)">
          <Button size="icon" variant="ghost" onClick={() => remove(p.id)}>
            <Trash2 className="text-destructive" />
          </Button>
        </Tip>
      </div>

      {prepared && (prepared.layout.overflow || prepared.layout.missing.length > 0 || prepared.missingFields.length > 0) && (
        <div className="flex flex-col gap-1 border-b bg-destructive-soft px-3 py-2 text-xs text-destructive-text">
          {prepared.layout.overflow && (
            <p className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Text does not fit the box{f.auto_shrink ? ` even at ${f.min_size_pt ?? f.size_pt} pt` : ""}.
            </p>
          )}
          {prepared.layout.missing.length > 0 && <p>Missing glyphs: {prepared.layout.missing.map((c) => `“${c}” U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(", ")}</p>}
          {prepared.missingFields.length > 0 && <p>Fields not in record: {prepared.missingFields.join(", ")}</p>}
        </div>
      )}

      <Section title="Content">
        <div className="flex gap-1">
          {(["field", "template"] as const).map((m) => (
            <Button key={m} size="sm" variant={p.binding.mode === m ? "secondary" : "ghost"} onClick={() => setBinding({ mode: m })} className="flex-1">
              {m === "field" ? "Single field" : "Text with {{fields}}"}
            </Button>
          ))}
        </div>
        {p.binding.mode === "field" ? (
          <Field label="Data field" error={fieldMissing ? `“${p.binding.field}” is not in the loaded data` : undefined}>
            {fields.length ? (
              <Select value={p.binding.field ?? ""} onChange={(e) => setBinding({ field: e.target.value || null })}>
                <option value="">— none —</option>
                {p.binding.field && !fields.includes(p.binding.field) && <option value={p.binding.field}>{p.binding.field} (missing)</option>}
                {fields.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Select>
            ) : (
              <Input value={p.binding.field ?? ""} onChange={(e) => setBinding({ field: e.target.value || null }, "field")} placeholder="Field name (load data for a list)" />
            )}
          </Field>
        ) : (
          <Field
            label="Template"
            error={syntaxErrors[0] ?? (unknownTokens.length && fields.length ? `Unknown field${unknownTokens.length > 1 ? "s" : ""}: ${unknownTokens.join(", ")}` : undefined)}
            hint="e.g. {{FirstName}} {{LastName}}"
          >
            <Textarea
              value={p.binding.template ?? ""}
              onChange={(e) => setBinding({ template: e.target.value }, "template")}
              aria-invalid={syntaxErrors.length > 0 || (unknownTokens.length > 0 && fields.length > 0)}
              rows={2}
              className="font-mono text-xs"
            />
            {fields.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {fields.map((x) => (
                  <button
                    key={x}
                    className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent"
                    onClick={() => setBinding({ template: `${p.binding.template ?? ""}{{${x}}}` })}
                  >
                    {x}
                  </button>
                ))}
              </div>
            )}
          </Field>
        )}
        <Field label="Sample text" hint="Shown in the editor when no data record is selected">
          <Input value={p.sample_text} onChange={(e) => set({ sample_text: e.target.value }, "sample")} />
        </Field>
        <Field label="ID" error={idTaken ? "IDs must be unique" : undefined}>
          <Input value={p.id} readOnly className="font-mono text-xs text-muted-foreground" />
        </Field>
      </Section>

      <Section title="Position & box">
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <LengthInput mm={p.x_mm} unit={unit} dpi={dpi} onChange={(v) => set({ x_mm: v }, "x")} />
          </Field>
          <Field label="Y">
            <LengthInput mm={p.y_mm} unit={unit} dpi={dpi} onChange={(v) => set({ y_mm: v }, "y")} />
          </Field>
          <Field label="Width">
            <LengthInput mm={p.box.width_mm} unit={unit} dpi={dpi} min={0.01} onChange={(v) => set({ box: { ...p.box, width_mm: v } }, "w")} />
          </Field>
          <Field label="Height">
            <LengthInput mm={p.box.height_mm} unit={unit} dpi={dpi} min={0.01} onChange={(v) => set({ box: { ...p.box, height_mm: v } }, "h")} />
          </Field>
          <Field label="Horizontal align">
            <Select value={p.align} onChange={(e) => set({ align: e.target.value as Placeholder["align"] })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </Select>
          </Field>
          <Field label="Vertical align">
            <Select value={p.valign} onChange={(e) => set({ valign: e.target.value as Placeholder["valign"] })}>
              <option value="top">Top</option>
              <option value="middle">Middle</option>
              <option value="bottom">Bottom</option>
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Font">
        <Field label="Family" error={!base ? "No fonts installed" : undefined}>
          <Select
            value={base?.family ?? ""}
            onChange={(e) => {
              const faces = facesOf(e.target.value);
              const face = faces.find((x) => x.style === "regular") ?? faces[0];
              if (face) setFont({ font_id: face.id });
            }}
          >
            {families.map((fam) => (
              <option key={fam} value={fam}>
                {fam}
              </option>
            ))}
          </Select>
        </Field>
        {base && facesOf(base.family).length > 1 && (
          <Field label="Face">
            <Select value={base.id} onChange={(e) => setFont({ font_id: Number(e.target.value) })}>
              {facesOf(base.family).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.style}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex gap-1">
          <Button size="sm" variant={f.bold ? "secondary" : "outline"} className="font-bold" onClick={() => setFont({ bold: !f.bold })} aria-pressed={f.bold}>
            B
          </Button>
          <Button size="sm" variant={f.italic ? "secondary" : "outline"} className="italic" onClick={() => setFont({ italic: !f.italic })} aria-pressed={f.italic}>
            I
          </Button>
          {resolved && <span className="ml-auto self-center truncate text-xs text-muted-foreground">{resolved.name}</span>}
        </div>
        {styleMissing && <p className="text-xs text-warning-text">“{base?.family}” has no {wantStyle} face installed — the {resolved?.style} face is used.</p>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Size (pt)">
            <NumberInput value={f.size_pt} step={0.5} min={0.5} max={1000} onChange={(v) => setFont({ size_pt: v }, "size")} />
          </Field>
          <Field label="Min size (pt)">
            <NumberInput value={f.min_size_pt} step={0.5} min={0.5} onChange={(v) => setFont({ min_size_pt: v }, "min")} disabled={!f.auto_shrink} />
          </Field>
        </div>
        {prepared && f.auto_shrink && Math.abs(prepared.sizePt - f.size_pt) > 1e-6 && (
          <p className="text-xs text-muted-foreground">Shrunk to {round(prepared.sizePt, 2)} pt for this text.</p>
        )}
        <SwitchField label="Auto-shrink to fit" checked={f.auto_shrink} onChange={(v) => setFont({ auto_shrink: v })} />
        <SwitchField label="Wrap lines" checked={f.wrap} onChange={(v) => setFont({ wrap: v })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Letter spacing (pt)">
            <NumberInput value={f.letter_spacing} step={0.1} onChange={(v) => setFont({ letter_spacing: v }, "ls")} />
          </Field>
          <Field label="Line height (×)">
            <NumberInput value={f.line_height} step={0.05} min={0.1} max={10} onChange={(v) => setFont({ line_height: v }, "lh")} />
          </Field>
        </div>
        <Field label="Transform">
          <Select value={f.transform} onChange={(e) => setFont({ transform: e.target.value as FontConfig["transform"] })}>
            <option value="none">None</option>
            <option value="uppercase">UPPERCASE</option>
            <option value="lowercase">lowercase</option>
            <option value="capitalize">Capitalize Each Word</option>
          </Select>
        </Field>
        <Field label="Colour">
          <ColorInput value={f.color} onChange={(v) => setFont({ color: v }, "color")} />
        </Field>
        <Field label="Fallback font" hint="Used for characters the main font cannot draw">
          <Select value={f.fallback_font_id ?? ""} onChange={(e) => setFont({ fallback_font_id: e.target.value ? Number(e.target.value) : null })}>
            <option value="">— none —</option>
            {[...lib.byId.values()]
              .filter((x) => x.style === "regular")
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.family}
                </option>
              ))}
          </Select>
        </Field>
      </Section>

      <Section title="Outline & shadow">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Outline (pt)">
            <NumberInput value={f.stroke_width_pt} step={0.1} min={0} onChange={(v) => setFont({ stroke_width_pt: v }, "stroke")} />
          </Field>
          <Field label="Outline colour">
            <ColorInput value={f.stroke_color} onChange={(v) => setFont({ stroke_color: v }, "strokecolor")} />
          </Field>
        </div>
        <SwitchField label="Drop shadow" checked={f.shadow.enabled} onChange={(v) => setShadow({ enabled: v })} />
        {f.shadow.enabled && (
          <div className="grid grid-cols-3 gap-2">
            <Field label="X (mm)">
              <NumberInput value={f.shadow.offset_x_mm} step={0.1} onChange={(v) => setShadow({ offset_x_mm: v }, "x")} />
            </Field>
            <Field label="Y (mm)">
              <NumberInput value={f.shadow.offset_y_mm} step={0.1} onChange={(v) => setShadow({ offset_y_mm: v }, "y")} />
            </Field>
            <Field label="Blur (mm)">
              <NumberInput value={f.shadow.blur_mm} step={0.1} min={0} onChange={(v) => setShadow({ blur_mm: v }, "blur")} />
            </Field>
            <Field label="Colour" className="col-span-3">
              <ColorInput value={f.shadow.color} onChange={(v) => setShadow({ color: v }, "color")} />
            </Field>
          </div>
        )}
      </Section>
    </div>
  );
}

export function LayerList({ prepared }: { prepared: ReadonlyMap<string, PreparedText> }) {
  const placeholders = useEditor((s) => s.config?.placeholders ?? NO_PLACEHOLDERS);
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const move = useEditor((s) => s.movePlaceholder);
  const add = useEditor((s) => s.addPlaceholder);
  const update = useEditor((s) => s.updatePlaceholder);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <Label>Placeholders (top first)</Label>
        <Button size="sm" variant="outline" onClick={() => add()}>
          <Plus /> Add
        </Button>
      </div>
      <ul className="flex flex-col">
        {[...placeholders].reverse().map((p) => {
          const prep = prepared.get(p.id);
          const problem = prep && (prep.layout.overflow || prep.layout.missing.length > 0 || prep.missingFields.length > 0);
          return (
            <li
              key={p.id}
              className={cn("group flex cursor-pointer items-center gap-1 px-3 py-1 text-sm hover:bg-accent", p.id === selectedId && "bg-accent")}
              onClick={() => select(p.id)}
            >
              <span className={cn("min-w-0 flex-1 truncate", p.hidden && "text-muted-foreground line-through")}>{p.label || p.id}</span>
              {problem && <Badge variant="destructive">!</Badge>}
              <button className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), update(p.id, { hidden: !p.hidden }))} aria-label="Toggle visibility">
                {p.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), move(p.id, "up"))} aria-label="Bring forward">
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), move(p.id, "down"))} aria-label="Send backward">
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              {p.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
            </li>
          );
        })}
        {!placeholders.length && <li className="px-3 py-2 text-xs text-muted-foreground">No placeholders yet. Click “Add” to create one.</li>}
      </ul>
    </div>
  );
}
