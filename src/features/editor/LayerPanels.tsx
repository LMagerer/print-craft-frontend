/** Layers list and the property panels for image/shape layers, multi-selection and the canvas. */
import { useQueryClient } from "@tanstack/react-query";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowUp,
  BringToFront,
  Circle,
  Copy,
  Eye,
  EyeOff,
  Group as GroupIcon,
  Image as ImageIcon,
  Loader2,
  Lock,
  Minus,
  SendToBack,
  Square,
  SquareUser,
  Trash2,
  Type,
  Ungroup,
  Unlock,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { fileUrl, postForm } from "@/api/client";
import type { ImageInfo, ImageSource, PhotoEntry, Record_, ShapeStyle, TemplateConfig } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NumberInput } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SwitchField } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import type { PreparedText } from "@/lib/cardPainter";
import { round, type Unit } from "@/lib/units";
import { cn } from "@/lib/utils";
import { elementOf, elementsOf, expandGroups, useEditor, type AlignMode, type Element } from "@/stores/editorStore";
import { ColorInput, LengthInput } from "./PlaceholderPanel";
import { layerImageRef } from "./useLayerImages";

export const ACCEPT_IMAGES_PDF = ".png,.jpg,.jpeg,.tif,.tiff,.webp,.pdf,image/png,image/jpeg,image/tiff,image/webp,application/pdf";

export async function uploadImage(file: File): Promise<ImageInfo> {
  const form = new FormData();
  form.append("file", file);
  return postForm<ImageInfo>("/images", form);
}

/** Natural size of an uploaded image in mm, scaled down to fit inside `maxW` x `maxH`. */
export function imageSizeMm(info: ImageInfo, maxW: number, maxH: number) {
  const dpi = info.dpi && info.dpi > 30 ? info.dpi : 300;
  const w = (info.width_px / dpi) * 25.4;
  const h = (info.height_px / dpi) * 25.4;
  const s = Math.min(1, maxW / w, maxH / h);
  return { w: round(w * s, 3), h: round(h * s, 3) };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b px-3 py-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}

function KindIcon({ el, className }: { el: Element; className?: string }) {
  const c = cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", className);
  if (el.kind === "text") return <Type className={c} />;
  if (el.kind === "image") return el.layer?.image?.mode === "field" ? <SquareUser className={c} /> : <ImageIcon className={c} />;
  const t = el.layer?.shape?.type;
  return t === "ellipse" ? <Circle className={c} /> : t === "line" ? <Minus className={c} /> : <Square className={c} />;
}

/* ------------------------------------------------------------------ layers list */

function LayerRow({ el, problem, indent }: { el: Element; problem: boolean; indent: boolean }) {
  const selectedIds = useEditor((s) => s.selectedIds);
  const { select, setSelection, setFlags, reorder, rename } = useEditor.getState();
  const [editing, setEditing] = useState(false);
  const active = selectedIds.includes(el.id);
  return (
    <li
      className={cn("group flex cursor-pointer items-center gap-1.5 py-1 pr-2 text-sm hover:bg-accent", indent ? "pl-7" : "pl-3", active && "bg-accent")}
      onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? select(el.id, true) : setSelection([el.id]))}
      onDoubleClick={() => setEditing(true)}
    >
      <KindIcon el={el} />
      {editing ? (
        <Input
          autoFocus
          defaultValue={el.name}
          className="h-6 px-1 text-xs"
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => {
            rename(el.id, e.target.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <span className={cn("min-w-0 flex-1 truncate", el.hidden && "text-muted-foreground line-through")}>{el.name}</span>
      )}
      {problem && <Badge variant="destructive">!</Badge>}
      <button className={cn("opacity-0 group-hover:opacity-100", el.hidden && "opacity-100")} onClick={(e) => (e.stopPropagation(), setFlags(el.id, { hidden: !el.hidden }))} aria-label="Toggle visibility">
        {el.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button className={cn("opacity-0 group-hover:opacity-100", el.locked && "opacity-100")} onClick={(e) => (e.stopPropagation(), setFlags(el.id, { locked: !el.locked }))} aria-label="Toggle lock">
        {el.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>
      <button className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), reorder([el.id], "forward"))} aria-label="Bring forward">
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), reorder([el.id], "backward"))} aria-label="Send backward">
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export function LayersPanel({ prepared }: { prepared: ReadonlyMap<string, PreparedText> }) {
  const config = useEditor((s) => s.config);
  const selectedIds = useEditor((s) => s.selectedIds);
  const { setSelection, apply, ungroup, setFlags } = useEditor.getState();
  if (!config) return null;
  const els = elementsOf(config).reverse();
  const problem = (id: string) => {
    const p = prepared.get(id);
    return !!p && (p.layout.overflow || p.layout.missing.length > 0 || p.missingFields.length > 0);
  };
  const emitted = new Set<string>();
  const rows: React.ReactNode[] = [];
  for (const el of els) {
    const gid = el.groupId;
    if (!gid) {
      rows.push(<LayerRow key={el.id} el={el} problem={problem(el.id)} indent={false} />);
      continue;
    }
    if (emitted.has(gid)) continue;
    emitted.add(gid);
    const members = els.filter((e) => e.groupId === gid);
    const group = config.groups.find((g) => g.id === gid);
    const active = members.every((m) => selectedIds.includes(m.id));
    const allHidden = members.every((m) => m.hidden);
    rows.push(
      <li
        key={`g-${gid}`}
        className={cn("group flex cursor-pointer items-center gap-1.5 px-3 py-1 text-sm font-medium hover:bg-accent", active && "bg-accent")}
        onClick={() => setSelection(members.map((m) => m.id))}
      >
        <GroupIcon className="h-3.5 w-3.5 shrink-0 text-violet-600" />
        <input
          value={group?.name ?? "Group"}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => apply((c) => ({ ...c, groups: c.groups.map((g) => (g.id === gid ? { ...g, name: e.target.value } : g)) }), `${gid}:name`)}
          className="min-w-0 flex-1 truncate bg-transparent outline-none focus:ring-1 focus:ring-ring"
          aria-label="Group name"
        />
        <button className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), members.forEach((m) => setFlags(m.id, { hidden: !allHidden })))} aria-label="Toggle group visibility">
          {allHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button className="opacity-0 group-hover:opacity-100" onClick={(e) => (e.stopPropagation(), ungroup([members[0].id]))} aria-label="Ungroup">
          <Ungroup className="h-3.5 w-3.5" />
        </button>
      </li>,
      ...members.map((m) => <LayerRow key={m.id} el={m} problem={problem(m.id)} indent />),
    );
  }
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <Label>Layers (top first)</Label>
        <span className="text-[11px] text-muted-foreground">{els.length}</span>
      </div>
      <ul className="flex flex-col">
        {rows}
        {!els.length && <li className="px-3 py-2 text-xs text-muted-foreground">Empty canvas. Add text, images or shapes from the toolbar.</li>}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ single layer */

function Header({ el }: { el: Element }) {
  const { rename, setFlags, duplicateElements, removeElements } = useEditor.getState();
  return (
    <div className="flex items-center gap-1 border-b px-3 py-2">
      <KindIcon el={el} className="h-4 w-4" />
      <Input value={el.layer?.name ?? ""} placeholder={el.name} onChange={(e) => rename(el.id, e.target.value)} className="h-7 font-medium" aria-label="Name" />
      <Tip content={el.hidden ? "Show" : "Hide (not rendered)"}>
        <Button size="icon" variant="ghost" onClick={() => setFlags(el.id, { hidden: !el.hidden })}>
          {el.hidden ? <EyeOff /> : <Eye />}
        </Button>
      </Tip>
      <Tip content={el.locked ? "Unlock" : "Lock position"}>
        <Button size="icon" variant="ghost" onClick={() => setFlags(el.id, { locked: !el.locked })}>
          {el.locked ? <Lock /> : <Unlock />}
        </Button>
      </Tip>
      <Tip content="Duplicate (Ctrl+D)">
        <Button size="icon" variant="ghost" onClick={() => duplicateElements([el.id])}>
          <Copy />
        </Button>
      </Tip>
      <Tip content="Delete (Del)">
        <Button size="icon" variant="ghost" onClick={() => removeElements([el.id])}>
          <Trash2 className="text-destructive" />
        </Button>
      </Tip>
    </div>
  );
}

function ArrangeButtons({ ids }: { ids: string[] }) {
  const { reorder } = useEditor.getState();
  return (
    <div className="grid grid-cols-4 gap-1">
      {(
        [
          ["front", "Bring to front", BringToFront],
          ["forward", "Bring forward", ArrowUp],
          ["backward", "Send backward", ArrowDown],
          ["back", "Send to back", SendToBack],
        ] as const
      ).map(([mode, label, Icon]) => (
        <Tip key={mode} content={label}>
          <Button size="sm" variant="outline" onClick={() => reorder(ids, mode)} aria-label={label}>
            <Icon />
          </Button>
        </Tip>
      ))}
    </div>
  );
}

function AlignButtons({ ids, single }: { ids: string[]; single: boolean }) {
  const { align, distribute } = useEditor.getState();
  const items: [AlignMode, string, typeof AlignStartVertical][] = [
    ["left", "Align left", AlignStartVertical],
    ["hcenter", "Align centre", AlignCenterVertical],
    ["right", "Align right", AlignEndVertical],
    ["top", "Align top", AlignStartHorizontal],
    ["vmiddle", "Align middle", AlignCenterHorizontal],
    ["bottom", "Align bottom", AlignEndHorizontal],
  ];
  return (
    <>
      <div className="grid grid-cols-6 gap-1">
        {items.map(([mode, label, Icon]) => (
          <Tip key={mode} content={single ? `${label} of card` : label}>
            <Button size="sm" variant="outline" className="px-0" onClick={() => align(ids, mode)} aria-label={label}>
              <Icon />
            </Button>
          </Tip>
        ))}
      </div>
      {ids.length >= 3 && (
        <div className="grid grid-cols-2 gap-1">
          <Button size="sm" variant="outline" onClick={() => distribute(ids, "h")}>
            <AlignHorizontalDistributeCenter /> Distribute H
          </Button>
          <Button size="sm" variant="outline" onClick={() => distribute(ids, "v")}>
            <AlignVerticalDistributeCenter /> Distribute V
          </Button>
        </div>
      )}
    </>
  );
}

function TransformSection({ el, unit, dpi }: { el: Element; unit: Unit; dpi: number }) {
  const { setGeometry, updateLayer } = useEditor.getState();
  const layer = el.layer!;
  const key = (k: string) => `${el.id}:${k}`;
  const ratioImg = el.kind === "image";
  return (
    <Section title="Position & size">
      <div className="grid grid-cols-2 gap-2">
        <Field label="X">
          <LengthInput mm={el.x} unit={unit} dpi={dpi} onChange={(v) => setGeometry(el.id, { x: v }, key("x"))} />
        </Field>
        <Field label="Y">
          <LengthInput mm={el.y} unit={unit} dpi={dpi} onChange={(v) => setGeometry(el.id, { y: v }, key("y"))} />
        </Field>
        <Field label="Width">
          <LengthInput mm={el.w} unit={unit} dpi={dpi} min={0.01} onChange={(v) => setGeometry(el.id, { w: v }, key("w"))} />
        </Field>
        <Field label="Height">
          <LengthInput mm={el.h} unit={unit} dpi={dpi} min={0.01} onChange={(v) => setGeometry(el.id, { h: v }, key("h"))} />
        </Field>
        <Field label="Rotation (°)">
          <NumberInput value={el.rotation} step={1} min={-360} max={360} onChange={(v) => setGeometry(el.id, { rotation: v }, key("rot"))} />
        </Field>
        <Field label="Opacity (%)">
          <NumberInput value={Math.round(layer.opacity * 100)} step={5} min={0} max={100} onChange={(v) => updateLayer(el.id, { opacity: Math.min(1, Math.max(0, v / 100)) }, key("opacity"))} />
        </Field>
        {(ratioImg || layer.shape?.type === "rect") && (
          <Field label="Corner radius" className="col-span-2">
            <LengthInput mm={layer.corner_radius_mm} unit={unit} dpi={dpi} min={0} onChange={(v) => updateLayer(el.id, { corner_radius_mm: Math.max(0, v) }, key("radius"))} />
          </Field>
        )}
      </div>
      <Label className="mt-1">Arrange</Label>
      <ArrangeButtons ids={[el.id]} />
      <Label className="mt-1">Align</Label>
      <AlignButtons ids={[el.id]} single />
    </Section>
  );
}

interface LayerPanelProps {
  el: Element;
  unit: Unit;
  dpi: number;
  fields: string[];
  record: Record_ | null;
  photos: readonly PhotoEntry[];
  layerImage: HTMLImageElement | undefined;
}

export function LayerPanel(props: LayerPanelProps) {
  const { el, unit, dpi } = props;
  return (
    <div className="text-sm">
      <Header el={el} />
      {el.kind === "image" ? <ImageSection {...props} /> : <ShapeSection el={el} unit={unit} dpi={dpi} />}
      <TransformSection el={el} unit={unit} dpi={dpi} />
    </div>
  );
}

function ImageSection({ el, fields, record, photos, layerImage }: LayerPanelProps) {
  const qc = useQueryClient();
  const { updateLayer, setGeometry } = useEditor.getState();
  const layer = el.layer!;
  const src = layer.image!;
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<null | "image" | "photos">(null);
  const setSrc = (patch: Partial<ImageSource>) => updateLayer(el.id, (l) => ({ ...l, image: { ...l.image!, ...patch } }));
  const resolved = layerImageRef(layer, record, photos);

  const replace = async (file: File) => {
    setBusy("image");
    try {
      const info = await uploadImage(file);
      setSrc({ ref: info.ref });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const uploadPhotos = async (files: FileList) => {
    setBusy("photos");
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      const r = await postForm<{ added: string[]; errors: string[] }>("/photos", form);
      await qc.invalidateQueries({ queryKey: ["photos"] });
      toast.success(`${r.added.length} photo${r.added.length === 1 ? "" : "s"} added`);
      for (const err of r.errors.slice(0, 5)) toast.error(err);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Image">
      <div className="flex gap-1">
        {(["static", "field"] as const).map((m) => (
          <Button key={m} size="sm" variant={src.mode === m ? "secondary" : "ghost"} className="flex-1" onClick={() => setSrc({ mode: m })}>
            {m === "static" ? "Same on every card" : "Photo per row"}
          </Button>
        ))}
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT_IMAGES_PDF} hidden onChange={(e) => (e.target.files?.[0] && replace(e.target.files[0]), (e.target.value = ""))} />
      {src.mode === "field" && (
        <>
          <Field label="Data field with the photo file name" hint="Values are matched to uploaded photos by file name (case-insensitive, extension optional).">
            {fields.length ? (
              <Select value={src.field ?? ""} onChange={(e) => setSrc({ field: e.target.value || null })}>
                <option value="">— choose —</option>
                {src.field && !fields.includes(src.field) && <option value={src.field}>{src.field} (missing)</option>}
                {fields.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </Select>
            ) : (
              <Input value={src.field ?? ""} onChange={(e) => setSrc({ field: e.target.value || null })} placeholder="Field name (load data for a list)" />
            )}
          </Field>
          <div className="flex items-center gap-2 rounded border bg-muted/40 p-2 text-xs">
            <span className="flex-1">
              {photos.length} photo{photos.length === 1 ? "" : "s"} uploaded
              {record && src.field && <span className={cn("block", resolved.missing ? "text-destructive-text" : "text-muted-foreground")}>{resolved.missing ? `No photo for “${record[src.field] ?? ""}” in this row` : "Photo found for this row"}</span>}
            </span>
            <input ref={photoRef} type="file" multiple accept={`${ACCEPT_IMAGES_PDF},.zip,application/zip`} hidden onChange={(e) => (e.target.files?.length && uploadPhotos(e.target.files), (e.target.value = ""))} />
            <Button size="sm" variant="outline" onClick={() => photoRef.current?.click()} disabled={busy !== null}>
              {busy === "photos" ? <Loader2 className="animate-spin" /> : <Upload />} Photos
            </Button>
          </div>
        </>
      )}
      <div className="flex items-center gap-2">
        {src.ref ? (
          <img src={fileUrl.thumbnail(src.ref, 160)} alt="" className="h-12 w-16 rounded border bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:10px_10px] object-contain" />
        ) : (
          <div className="flex h-12 w-16 items-center justify-center rounded border text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
        <Button size="sm" variant="outline" className="flex-1" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "image" ? <Loader2 className="animate-spin" /> : <Upload />} {src.mode === "field" ? "Sample image" : src.ref ? "Replace image" : "Choose image"}
        </Button>
      </div>
      <Field label="Fit">
        <Select value={src.fit} onChange={(e) => setSrc({ fit: e.target.value as ImageSource["fit"] })}>
          <option value="cover">Cover (crop to fill the box)</option>
          <option value="contain">Contain (whole image inside the box)</option>
          <option value="fill">Stretch to the box</option>
        </Select>
      </Field>
      {layerImage && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setGeometry(el.id, { h: (el.w * layerImage.naturalHeight) / layerImage.naturalWidth })}
          title="Set the height from the width and the image's aspect ratio"
        >
          Match image aspect ratio
        </Button>
      )}
    </Section>
  );
}

function ShapeSection({ el, unit, dpi }: { el: Element; unit: Unit; dpi: number }) {
  const { updateLayer } = useEditor.getState();
  const st = el.layer!.shape!;
  const setShape = (patch: Partial<ShapeStyle>, key?: string) => updateLayer(el.id, (l) => ({ ...l, shape: { ...l.shape!, ...patch } }), key ? `${el.id}:shape.${key}` : undefined);
  const isLine = st.type === "line";
  return (
    <Section title="Shape">
      <Field label="Type">
        <Select
          value={st.type}
          onChange={(e) => {
            const type = e.target.value as ShapeStyle["type"];
            setShape(type === "line" && !st.stroke ? { type, stroke: st.fill ?? "#000000", stroke_width_mm: Math.max(st.stroke_width_mm, 0.5) } : { type });
          }}
        >
          <option value="rect">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="line">Line</option>
        </Select>
      </Field>
      {!isLine && (
        <>
          <SwitchField label="Fill" checked={!!st.fill} onChange={(v) => setShape({ fill: v ? "#3b82f6" : null })} />
          {st.fill && <ColorInput value={st.fill} onChange={(v) => setShape({ fill: v }, "fill")} />}
        </>
      )}
      <SwitchField label={isLine ? "Line colour" : "Outline"} checked={!!st.stroke} onChange={(v) => setShape(v ? { stroke: "#000000", stroke_width_mm: st.stroke_width_mm || 0.3 } : { stroke: null })} />
      {st.stroke && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Colour" className="col-span-2">
            <ColorInput value={st.stroke} onChange={(v) => setShape({ stroke: v }, "stroke")} />
          </Field>
          <Field label="Thickness">
            <LengthInput mm={st.stroke_width_mm} unit={unit} dpi={dpi} min={0} onChange={(v) => setShape({ stroke_width_mm: Math.max(0, v) }, "sw")} />
          </Field>
        </div>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ multi-selection & canvas */

export function MultiPanel({ ids }: { ids: string[] }) {
  const config = useEditor((s) => s.config)!;
  const { group, ungroup, removeElements, duplicateElements } = useEditor.getState();
  const els = ids.map((id) => elementOf(config, id)).filter((e): e is Element => !!e);
  const groupIds = new Set(els.map((e) => e.groupId));
  const oneGroup = groupIds.size === 1 && !groupIds.has(null) && expandGroups(config, [ids[0]]).length === ids.length;
  const anyGrouped = els.some((e) => e.groupId);
  const groupName = oneGroup ? config.groups.find((g) => g.id === els[0].groupId)?.name : null;
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 border-b px-3 py-3">
        {oneGroup ? <GroupIcon className="h-4 w-4 text-violet-600" /> : null}
        <span className="flex-1 font-medium">{oneGroup ? groupName : `${els.length} elements selected`}</span>
        <Tip content="Duplicate (Ctrl+D)">
          <Button size="icon" variant="ghost" onClick={() => duplicateElements(ids)}>
            <Copy />
          </Button>
        </Tip>
        <Tip content="Delete (Del)">
          <Button size="icon" variant="ghost" onClick={() => removeElements(ids)}>
            <Trash2 className="text-destructive" />
          </Button>
        </Tip>
      </div>
      <Section title="Group">
        <div className="grid grid-cols-2 gap-1">
          <Button size="sm" variant="outline" onClick={() => group(ids)} disabled={oneGroup}>
            <GroupIcon /> Group <kbd className="ml-auto text-[10px] text-muted-foreground">Ctrl+G</kbd>
          </Button>
          <Button size="sm" variant="outline" onClick={() => ungroup(ids)} disabled={!anyGrouped}>
            <Ungroup /> Ungroup
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Click a group member on the card to select the whole group; double-click to select just that element.</p>
      </Section>
      <Section title="Align">
        <AlignButtons ids={ids} single={false} />
      </Section>
      <Section title="Arrange">
        <ArrangeButtons ids={ids} />
      </Section>
    </div>
  );
}

export function CanvasPanel({ config }: { config: TemplateConfig }) {
  const { apply } = useEditor.getState();
  const bg = config.background;
  return (
    <div className="text-sm">
      <Section title="Canvas">
        <SwitchField label="Background colour" checked={bg !== null} onChange={(v) => apply((c) => ({ ...c, background: v ? "#ffffff" : null }))} />
        {bg !== null ? (
          <ColorInput value={bg} onChange={(v) => apply((c) => ({ ...c, background: v }), "background")} />
        ) : (
          <p className="text-xs text-muted-foreground">Transparent: only the base image and layers are drawn.</p>
        )}
        <p className="text-xs text-muted-foreground">
          {round(config.size.width_mm, 2)} × {round(config.size.height_mm, 2)} mm at {Math.round(config.size.dpi)} DPI. Use “Size” in the toolbar to change it.
        </p>
      </Section>
      <div className="p-4 text-xs text-muted-foreground">
        Select an element on the card or in the layers list to edit it. Shift-click or drag a box to select several; Ctrl+G groups them.
      </div>
    </div>
  );
}
