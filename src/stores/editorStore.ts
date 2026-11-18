/** Editor state: the working template config, selection and an undo/redo history. */
import { create } from "zustand";
import type { Layer, Placeholder, TemplateConfig } from "@/api/types";
import { templateConfigSchema } from "@/api/templateConfig.zod";
import { round3 } from "@/lib/geometry";
import { uid } from "@/lib/utils";

const HISTORY_LIMIT = 100;
/** Consecutive edits with the same key inside this window are merged into one undo step (typing, nudging). */
const MERGE_MS = 800;
const DUPLICATE_OFFSET_MM = 2;

export type ReorderMode = "forward" | "backward" | "front" | "back";
export type AlignMode = "left" | "hcenter" | "right" | "top" | "vmiddle" | "bottom";

/** Common view of a design element: a text placeholder or an image/shape layer. Geometry in mm, unrotated box. */
export interface Element {
  id: string;
  kind: Layer["kind"];
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  locked: boolean;
  hidden: boolean;
  groupId: string | null;
  layer: Layer | null;
  placeholder: Placeholder | null;
}

export interface Geometry {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rotation?: number;
}

export interface EditorState {
  templateId: number | null;
  config: TemplateConfig | null;
  /** Config as last saved, to detect unsaved changes. */
  savedJson: string;
  /** Selected element ids; the last one is the primary selection shown in the properties panel. */
  selectedIds: string[];
  selectedId: string | null;
  past: TemplateConfig[];
  future: TemplateConfig[];
  lastKey: string | null;
  lastAt: number;

  load(templateId: number, config: TemplateConfig): void;
  markSaved(config?: TemplateConfig): void;
  /**
   * Apply a change. `mergeKey` groups rapid successive changes into one history entry; keys starting with
   * "gesture:" (one drag/resize) merge regardless of time.
   */
  apply(fn: (c: TemplateConfig) => TemplateConfig, mergeKey?: string): void;
  /** Replace the config, recording an undo step. */
  replace(config: TemplateConfig): void;
  undo(): void;
  redo(): void;
  /** Select one element (`toggle` adds/removes it from the current selection). */
  select(id: string | null, toggle?: boolean): void;
  setSelection(ids: string[]): void;

  updatePlaceholder(id: string, patch: Partial<Placeholder> | ((p: Placeholder) => Placeholder), mergeKey?: string): void;
  addPlaceholder(partial?: Partial<Placeholder>): string;
  removePlaceholder(id: string): void;
  duplicatePlaceholder(id: string): string | null;
  movePlaceholder(id: string, direction: "up" | "down"): void;

  updateLayer(id: string, patch: Partial<Layer> | ((l: Layer) => Layer), mergeKey?: string): void;
  addLayer(partial: Partial<Layer> & Pick<Layer, "kind">): string;
  setGeometry(id: string, g: Geometry, mergeKey?: string): void;
  moveBy(ids: string[], dx: number, dy: number, mergeKey?: string): void;
  setFlags(id: string, flags: { hidden?: boolean; locked?: boolean }): void;
  rename(id: string, name: string): void;
  removeElements(ids: string[]): void;
  duplicateElements(ids: string[]): string[];
  reorder(ids: string[], mode: ReorderMode): void;
  group(ids: string[]): string | null;
  ungroup(ids: string[]): void;
  align(ids: string[], mode: AlignMode): void;
  distribute(ids: string[], axis: "h" | "v"): void;
}

const placeholderSchema = templateConfigSchema.shape.placeholders.unwrap().element;
const layerSchema = templateConfigSchema.shape.layers.unwrap().element;

export const newPlaceholder = (partial: Partial<Placeholder> = {}): Placeholder =>
  placeholderSchema.parse({
    id: partial.id ?? uid(),
    label: partial.label ?? "Text",
    x_mm: partial.x_mm ?? 5,
    y_mm: partial.y_mm ?? 5,
    box: partial.box ?? { width_mm: 40, height_mm: 8 },
    ...partial,
  });

export const newLayer = (partial: Partial<Layer> & Pick<Layer, "kind">): Layer => {
  const l = layerSchema.parse({ id: partial.id ?? uid("ly"), ...partial });
  if (l.kind === "image" && !l.image) return { ...l, image: layerSchema.shape.image.parse({ mode: "static" }) ?? null };
  if (l.kind === "shape" && !l.shape) return { ...l, shape: layerSchema.shape.shape.parse({ type: "rect" }) ?? null };
  return l;
};

/**
 * Every placeholder gets a text layer in the stack (older templates have none): unreferenced placeholders are
 * drawn on top by the renderer, so appending them keeps the output unchanged.
 */
export function normalizeConfig(c: TemplateConfig): TemplateConfig {
  const ph = new Set(c.placeholders.map((p) => p.id));
  const layers = c.layers.filter((l) => l.kind !== "text" || ph.has(l.id));
  const have = new Set(layers.filter((l) => l.kind === "text").map((l) => l.id));
  const missing = c.placeholders.filter((p) => !have.has(p.id)).map((p) => newLayer({ id: p.id, kind: "text" }));
  if (!missing.length && layers.length === c.layers.length) return c;
  return { ...c, layers: [...layers, ...missing] };
}

export function elementOf(c: TemplateConfig, id: string): Element | null {
  const layer = c.layers.find((l) => l.id === id) ?? null;
  const p = c.placeholders.find((q) => q.id === id) ?? null;
  if (p)
    return {
      id,
      kind: "text",
      name: p.label || p.id,
      x: p.x_mm,
      y: p.y_mm,
      w: p.box.width_mm,
      h: p.box.height_mm,
      rotation: 0,
      locked: p.locked,
      hidden: p.hidden,
      groupId: layer?.group_id ?? null,
      layer,
      placeholder: p,
    };
  if (!layer) return null;
  return {
    id,
    kind: layer.kind,
    name: layer.name || defaultName(layer),
    x: layer.x_mm,
    y: layer.y_mm,
    w: layer.width_mm,
    h: layer.height_mm,
    rotation: layer.rotation,
    locked: layer.locked,
    hidden: layer.hidden,
    groupId: layer.group_id,
    layer,
    placeholder: null,
  };
}

/** Elements bottom to top. */
export const elementsOf = (c: TemplateConfig): Element[] => c.layers.map((l) => elementOf(c, l.id)).filter((e): e is Element => !!e);

export function defaultName(l: Layer): string {
  if (l.kind === "image") return l.image?.mode === "field" ? `Photo (${l.image.field ?? "field"})` : "Image";
  if (l.kind === "shape") return { rect: "Rectangle", ellipse: "Ellipse", line: "Line" }[l.shape?.type ?? "rect"];
  return l.id;
}

/** All ids in the same groups as `ids` (selecting one member of a group selects the group). */
export function expandGroups(c: TemplateConfig, ids: string[]): string[] {
  const groups = new Set(ids.map((id) => c.layers.find((l) => l.id === id)?.group_id).filter(Boolean));
  if (!groups.size) return ids;
  const extra = c.layers.filter((l) => l.group_id && groups.has(l.group_id)).map((l) => l.id);
  return [...new Set([...ids, ...extra])];
}

export const isDirty = (s: Pick<EditorState, "config" | "savedJson">) => !!s.config && JSON.stringify(s.config) !== s.savedJson;

function freshId(c: TemplateConfig, prefix: string, wanted?: string): string {
  const used = new Set([...c.placeholders.map((p) => p.id), ...c.layers.map((l) => l.id), ...c.groups.map((g) => g.id)]);
  let id = wanted ?? uid(prefix);
  while (used.has(id)) id = uid(prefix);
  return id;
}

function withGeometry(c: TemplateConfig, id: string, g: Geometry): TemplateConfig {
  const r = (v: number | undefined) => (v === undefined ? undefined : round3(v));
  const [x, y, w, h] = [r(g.x), r(g.y), r(g.w), r(g.h)];
  if (c.placeholders.some((p) => p.id === id))
    return {
      ...c,
      placeholders: c.placeholders.map((p) =>
        p.id === id
          ? { ...p, x_mm: x ?? p.x_mm, y_mm: y ?? p.y_mm, box: { width_mm: Math.max(0.01, w ?? p.box.width_mm), height_mm: Math.max(0.01, h ?? p.box.height_mm) } }
          : p,
      ),
    };
  return {
    ...c,
    layers: c.layers.map((l) =>
      l.id === id
        ? {
            ...l,
            x_mm: x ?? l.x_mm,
            y_mm: y ?? l.y_mm,
            width_mm: Math.max(0.01, w ?? l.width_mm),
            height_mm: Math.max(0.01, h ?? l.height_mm),
            rotation: g.rotation === undefined ? l.rotation : normalizeRotation(g.rotation),
          }
        : l,
    ),
  };
}

export const normalizeRotation = (deg: number) => {
  const r = Math.round((((deg % 360) + 540) % 360 - 180) * 100) / 100;
  return r === -180 ? 180 : r;
};

/** Drop groups with fewer than two members (a group of one is no group). */
function pruneGroups(c: TemplateConfig): TemplateConfig {
  const count = new Map<string, number>();
  for (const l of c.layers) if (l.group_id) count.set(l.group_id, (count.get(l.group_id) ?? 0) + 1);
  const keep = new Set([...count].filter(([, n]) => n >= 2).map(([g]) => g));
  if (keep.size === c.groups.length && c.layers.every((l) => !l.group_id || keep.has(l.group_id))) return c;
  return {
    ...c,
    groups: c.groups.filter((g) => keep.has(g.id)),
    layers: c.layers.map((l) => (l.group_id && !keep.has(l.group_id) ? { ...l, group_id: null } : l)),
  };
}

function reorderLayers(layers: Layer[], ids: Set<string>, mode: ReorderMode): Layer[] {
  const list = [...layers];
  const has = (i: number) => ids.has(list[i].id);
  if (mode === "front") return [...list.filter((l) => !ids.has(l.id)), ...list.filter((l) => ids.has(l.id))];
  if (mode === "back") return [...list.filter((l) => ids.has(l.id)), ...list.filter((l) => !ids.has(l.id))];
  if (mode === "forward") {
    for (let i = list.length - 2; i >= 0; i--) if (has(i) && !has(i + 1)) [list[i], list[i + 1]] = [list[i + 1], list[i]];
  } else {
    for (let i = 1; i < list.length; i++) if (has(i) && !has(i - 1)) [list[i], list[i - 1]] = [list[i - 1], list[i]];
  }
  return list;
}

const selection = (ids: string[]) => ({ selectedIds: ids, selectedId: ids.length ? ids[ids.length - 1] : null });

export const useEditor = create<EditorState>()((set, get) => ({
  templateId: null,
  config: null,
  savedJson: "",
  selectedIds: [],
  selectedId: null,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,

  load(templateId, raw) {
    const config = normalizeConfig(raw);
    set({ templateId, config, savedJson: JSON.stringify(config), ...selection([]), past: [], future: [], lastKey: null, lastAt: 0 });
  },

  markSaved(raw) {
    const config = raw ? normalizeConfig(raw) : undefined;
    const c = config ?? get().config;
    set({ savedJson: JSON.stringify(c), ...(config ? { config } : {}) });
  },

  apply(fn, mergeKey) {
    const { config, past, lastKey, lastAt } = get();
    if (!config) return;
    const next = fn(config);
    if (next === config) return;
    const now = Date.now();
    const merge = mergeKey !== undefined && mergeKey === lastKey && (mergeKey.startsWith("gesture:") || now - lastAt < MERGE_MS);
    set({
      config: next,
      past: merge ? past : [...past, config].slice(-HISTORY_LIMIT),
      future: [],
      lastKey: mergeKey ?? null,
      lastAt: now,
    });
  },

  replace(config) {
    get().apply(() => normalizeConfig(config));
  },

  undo() {
    const { config, past, future } = get();
    if (!config || !past.length) return;
    const prev = past[past.length - 1];
    set({ config: prev, past: past.slice(0, -1), future: [config, ...future], lastKey: null, ...keepSelection(get().selectedIds, prev) });
  },

  redo() {
    const { config, past, future } = get();
    if (!config || !future.length) return;
    const next = future[0];
    set({ config: next, past: [...past, config], future: future.slice(1), lastKey: null, ...keepSelection(get().selectedIds, next) });
  },

  select(id, toggle) {
    if (id === null) return set(selection([]));
    if (!toggle) return set(selection([id]));
    const cur = get().selectedIds;
    set(selection(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  },

  setSelection(ids) {
    set(selection([...new Set(ids)]));
  },

  updatePlaceholder(id, patch, mergeKey) {
    get().apply(
      (c) => ({
        ...c,
        placeholders: c.placeholders.map((p) => (p.id === id ? (typeof patch === "function" ? patch(p) : { ...p, ...patch }) : p)),
      }),
      mergeKey,
    );
  },

  addPlaceholder(partial) {
    const config = get().config;
    if (!config) return "";
    const id = freshId(config, "ph", partial?.id);
    const p = newPlaceholder({ ...partial, id });
    get().apply((c) => ({ ...c, placeholders: [...c.placeholders, p], layers: [...c.layers, newLayer({ id, kind: "text" })] }));
    set(selection([id]));
    return id;
  },

  removePlaceholder(id) {
    get().removeElements([id]);
  },

  duplicatePlaceholder(id) {
    return get().duplicateElements([id])[0] ?? null;
  },

  movePlaceholder(id, direction) {
    get().reorder([id], direction === "up" ? "forward" : "backward");
  },

  updateLayer(id, patch, mergeKey) {
    get().apply(
      (c) => ({ ...c, layers: c.layers.map((l) => (l.id === id ? (typeof patch === "function" ? patch(l) : { ...l, ...patch }) : l)) }),
      mergeKey,
    );
  },

  addLayer(partial) {
    const config = get().config;
    if (!config) return "";
    const id = freshId(config, "ly", partial.id);
    const l = newLayer({ ...partial, id });
    get().apply((c) => ({ ...c, layers: [...c.layers, l] }));
    set(selection([id]));
    return id;
  },

  setGeometry(id, g, mergeKey) {
    get().apply((c) => withGeometry(c, id, g), mergeKey);
  },

  moveBy(ids, dx, dy, mergeKey) {
    get().apply((c) => {
      let out = c;
      for (const id of ids) {
        const e = elementOf(c, id);
        if (e && !e.locked) out = withGeometry(out, id, { x: e.x + dx, y: e.y + dy });
      }
      return out;
    }, mergeKey);
  },

  setFlags(id, flags) {
    const c = get().config;
    if (!c) return;
    if (c.placeholders.some((p) => p.id === id)) get().updatePlaceholder(id, flags);
    else get().updateLayer(id, flags);
  },

  rename(id, name) {
    const c = get().config;
    if (!c) return;
    if (c.placeholders.some((p) => p.id === id)) get().updatePlaceholder(id, { label: name }, `${id}:label`);
    else get().updateLayer(id, { name }, `${id}:name`);
  },

  removeElements(ids) {
    const gone = new Set(ids);
    if (!gone.size) return;
    get().apply((c) =>
      pruneGroups({ ...c, placeholders: c.placeholders.filter((p) => !gone.has(p.id)), layers: c.layers.filter((l) => !gone.has(l.id)) }),
    );
    set(selection(get().selectedIds.filter((x) => !gone.has(x))));
  },

  duplicateElements(ids) {
    const config = get().config;
    if (!config) return [];
    let c = config;
    const created: string[] = [];
    // Copies of whole groups form new groups; copies of single members are ungrouped.
    const groupMap = new Map<string, string>();
    const selected = new Set(ids);
    for (const g of c.groups) {
      const members = c.layers.filter((l) => l.group_id === g.id);
      if (members.length && members.every((l) => selected.has(l.id))) {
        const gid = freshId(c, "grp");
        groupMap.set(g.id, gid);
        c = { ...c, groups: [...c.groups, { id: gid, name: `${g.name} copy` }] };
      }
    }
    const order = c.layers.filter((l) => selected.has(l.id));
    for (const src of order) {
      const id = freshId(c, src.kind === "text" ? "ph" : "ly");
      const group_id = src.group_id ? (groupMap.get(src.group_id) ?? null) : null;
      const at = c.layers.findIndex((l) => l.id === src.id) + 1;
      const copy: Layer =
        src.kind === "text"
          ? { ...src, id, group_id }
          : { ...structuredClone(src), id, group_id, name: `${src.name || defaultName(src)} copy`, x_mm: src.x_mm + DUPLICATE_OFFSET_MM, y_mm: src.y_mm + DUPLICATE_OFFSET_MM, locked: false };
      const layers = [...c.layers];
      layers.splice(at, 0, copy);
      c = { ...c, layers };
      if (src.kind === "text") {
        const p = c.placeholders.find((q) => q.id === src.id);
        if (!p) continue;
        c = {
          ...c,
          placeholders: [
            ...c.placeholders,
            { ...structuredClone(p), id, label: `${p.label || p.id} copy`, x_mm: p.x_mm + DUPLICATE_OFFSET_MM, y_mm: p.y_mm + DUPLICATE_OFFSET_MM, locked: false },
          ],
        };
      }
      created.push(id);
    }
    if (!created.length) return [];
    get().apply(() => c);
    set(selection(created));
    return created;
  },

  reorder(ids, mode) {
    const c = get().config;
    if (!c) return;
    const set_ = new Set(expandGroups(c, ids));
    get().apply((cfg) => {
      const layers = reorderLayers(cfg.layers, set_, mode);
      return layers.every((l, i) => l === cfg.layers[i]) ? cfg : { ...cfg, layers };
    });
  },

  group(ids) {
    const config = get().config;
    if (!config) return null;
    const members = new Set(expandGroups(config, ids).filter((id) => config.layers.some((l) => l.id === id)));
    if (members.size < 2) return null;
    const gid = freshId(config, "grp");
    get().apply((c) => {
      // Members become contiguous in the stack, at the position of the topmost one.
      const top = c.layers.reduce((acc, l, i) => (members.has(l.id) ? i : acc), -1);
      const before = c.layers.slice(0, top).filter((l) => !members.has(l.id)).length;
      const grouped = c.layers.filter((l) => members.has(l.id)).map((l) => ({ ...l, group_id: gid }));
      const rest = c.layers.filter((l) => !members.has(l.id));
      rest.splice(before, 0, ...grouped);
      return pruneGroups({ ...c, groups: [...c.groups, { id: gid, name: `Group ${c.groups.length + 1}` }], layers: rest });
    });
    set(selection([...members]));
    return gid;
  },

  ungroup(ids) {
    const c = get().config;
    if (!c) return;
    const groups = new Set(ids.map((id) => c.layers.find((l) => l.id === id)?.group_id).filter((g): g is string => !!g));
    if (!groups.size) return;
    get().apply((cfg) => ({
      ...cfg,
      groups: cfg.groups.filter((g) => !groups.has(g.id)),
      layers: cfg.layers.map((l) => (l.group_id && groups.has(l.group_id) ? { ...l, group_id: null } : l)),
    }));
  },

  align(ids, mode) {
    const c = get().config;
    if (!c) return;
    const els = ids.map((id) => elementOf(c, id)).filter((e): e is Element => !!e && !e.locked);
    if (!els.length) return;
    // A single element aligns to the card; several align to their common bounding box.
    const box =
      els.length === 1 && ids.length === 1
        ? { x0: 0, y0: 0, x1: c.size.width_mm, y1: c.size.height_mm }
        : {
            x0: Math.min(...els.map((e) => e.x)),
            y0: Math.min(...els.map((e) => e.y)),
            x1: Math.max(...els.map((e) => e.x + e.w)),
            y1: Math.max(...els.map((e) => e.y + e.h)),
          };
    get().apply((cfg) => {
      let out = cfg;
      for (const e of els) {
        const g: Geometry =
          mode === "left"
            ? { x: box.x0 }
            : mode === "right"
              ? { x: box.x1 - e.w }
              : mode === "hcenter"
                ? { x: (box.x0 + box.x1) / 2 - e.w / 2 }
                : mode === "top"
                  ? { y: box.y0 }
                  : mode === "bottom"
                    ? { y: box.y1 - e.h }
                    : { y: (box.y0 + box.y1) / 2 - e.h / 2 };
        out = withGeometry(out, e.id, g);
      }
      return out;
    });
  },

  distribute(ids, axis) {
    const c = get().config;
    if (!c) return;
    const els = ids.map((id) => elementOf(c, id)).filter((e): e is Element => !!e && !e.locked);
    if (els.length < 3) return;
    const pos = (e: Element) => (axis === "h" ? e.x : e.y);
    const len = (e: Element) => (axis === "h" ? e.w : e.h);
    els.sort((a, b) => pos(a) - pos(b));
    const start = pos(els[0]);
    const end = Math.max(...els.map((e) => pos(e) + len(e)));
    const gap = (end - start - els.reduce((n, e) => n + len(e), 0)) / (els.length - 1);
    get().apply((cfg) => {
      let out = cfg;
      let at = start;
      for (const e of els) {
        out = withGeometry(out, e.id, axis === "h" ? { x: at } : { y: at });
        at += len(e) + gap;
      }
      return out;
    });
  },
}));

function keepSelection(ids: string[], config: TemplateConfig) {
  const exists = new Set([...config.placeholders.map((p) => p.id), ...config.layers.map((l) => l.id)]);
  return selection(ids.filter((id) => exists.has(id)));
}
