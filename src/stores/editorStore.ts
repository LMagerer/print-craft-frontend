/** Editor state: the working template config, selection and an undo/redo history. */
import { create } from "zustand";
import type { Placeholder, TemplateConfig } from "@/api/types";
import { templateConfigSchema } from "@/api/templateConfig.zod";
import { uid } from "@/lib/utils";

const HISTORY_LIMIT = 100;
/** Consecutive edits with the same key inside this window are merged into one undo step (typing, nudging). */
const MERGE_MS = 800;

export interface EditorState {
  templateId: number | null;
  config: TemplateConfig | null;
  /** Config as last saved, to detect unsaved changes. */
  savedJson: string;
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
  select(id: string | null): void;

  updatePlaceholder(id: string, patch: Partial<Placeholder> | ((p: Placeholder) => Placeholder), mergeKey?: string): void;
  addPlaceholder(partial?: Partial<Placeholder>): string;
  removePlaceholder(id: string): void;
  duplicatePlaceholder(id: string): string | null;
  movePlaceholder(id: string, direction: "up" | "down"): void;
}

export const newPlaceholder = (partial: Partial<Placeholder> = {}): Placeholder =>
  templateConfigSchema.shape.placeholders.unwrap().element.parse({
    id: partial.id ?? uid(),
    label: partial.label ?? "Text",
    x_mm: partial.x_mm ?? 5,
    y_mm: partial.y_mm ?? 5,
    box: partial.box ?? { width_mm: 40, height_mm: 8 },
    ...partial,
  });

export const isDirty = (s: Pick<EditorState, "config" | "savedJson">) => !!s.config && JSON.stringify(s.config) !== s.savedJson;

export const useEditor = create<EditorState>()((set, get) => ({
  templateId: null,
  config: null,
  savedJson: "",
  selectedId: null,
  past: [],
  future: [],
  lastKey: null,
  lastAt: 0,

  load(templateId, config) {
    set({ templateId, config, savedJson: JSON.stringify(config), selectedId: null, past: [], future: [], lastKey: null, lastAt: 0 });
  },

  markSaved(config) {
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
    get().apply(() => config);
  },

  undo() {
    const { config, past, future } = get();
    if (!config || !past.length) return;
    const prev = past[past.length - 1];
    set({ config: prev, past: past.slice(0, -1), future: [config, ...future], lastKey: null, ...keepSelection(get().selectedId, prev) });
  },

  redo() {
    const { config, past, future } = get();
    if (!config || !future.length) return;
    const next = future[0];
    set({ config: next, past: [...past, config], future: future.slice(1), lastKey: null, ...keepSelection(get().selectedId, next) });
  },

  select(id) {
    set({ selectedId: id });
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
    const used = new Set(config?.placeholders.map((p) => p.id));
    let id = partial?.id ?? uid();
    while (used.has(id)) id = uid();
    const p = newPlaceholder({ ...partial, id });
    get().apply((c) => ({ ...c, placeholders: [...c.placeholders, p] }));
    set({ selectedId: id });
    return id;
  },

  removePlaceholder(id) {
    get().apply((c) => ({ ...c, placeholders: c.placeholders.filter((p) => p.id !== id) }));
    if (get().selectedId === id) set({ selectedId: null });
  },

  duplicatePlaceholder(id) {
    const src = get().config?.placeholders.find((p) => p.id === id);
    if (!src) return null;
    return get().addPlaceholder({
      ...structuredClone(src),
      id: undefined as unknown as string,
      label: `${src.label} copy`,
      x_mm: src.x_mm + 2,
      y_mm: src.y_mm + 2,
      locked: false,
    });
  },

  movePlaceholder(id, direction) {
    get().apply((c) => {
      const i = c.placeholders.findIndex((p) => p.id === id);
      const j = direction === "up" ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= c.placeholders.length) return c;
      const list = [...c.placeholders];
      [list[i], list[j]] = [list[j], list[i]];
      return { ...c, placeholders: list };
    });
  },
}));

function keepSelection(selectedId: string | null, config: TemplateConfig) {
  return { selectedId: selectedId && config.placeholders.some((p) => p.id === selectedId) ? selectedId : null };
}
