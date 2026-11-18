import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "@/api/types";
import { isDirty, useEditor } from "./editorStore";

const base = () => parseConfig({ size: { width_mm: 85.6, height_mm: 54 }, placeholders: [{ id: "a", x_mm: 5, y_mm: 5, box: { width_mm: 30, height_mm: 8 } }] });
const s = () => useEditor.getState();
const xOf = (id: string) => s().config!.placeholders.find((p) => p.id === id)!.x_mm;

describe("editorStore", () => {
  beforeEach(() => {
    vi.useRealTimers();
    s().load(1, base());
  });

  it("fills nested defaults when parsing", () => {
    const p = s().config!.placeholders[0];
    expect(p.font.size_pt).toBe(12);
    expect(p.font.shadow.enabled).toBe(false);
    expect(p.binding.mode).toBe("field");
    expect(s().config!.output.filename_field).toBeNull();
  });

  it("undoes and redoes, and tracks dirty state", () => {
    expect(isDirty(s())).toBe(false);
    s().updatePlaceholder("a", { x_mm: 10 });
    s().updatePlaceholder("a", { x_mm: 20 });
    expect(isDirty(s())).toBe(true);
    s().undo();
    expect(xOf("a")).toBe(10);
    s().undo();
    expect(xOf("a")).toBe(5);
    expect(isDirty(s())).toBe(false);
    s().redo();
    expect(xOf("a")).toBe(10);
    s().updatePlaceholder("a", { x_mm: 7 });
    expect(s().future).toHaveLength(0);
  });

  it("merges rapid edits with the same key, but not after the window", () => {
    vi.useFakeTimers();
    s().updatePlaceholder("a", { x_mm: 6 }, "nudge:a");
    s().updatePlaceholder("a", { x_mm: 7 }, "nudge:a");
    expect(s().past).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    s().updatePlaceholder("a", { x_mm: 8 }, "nudge:a");
    expect(s().past).toHaveLength(2);
    s().undo();
    expect(xOf("a")).toBe(7);
  });

  it("always merges gesture keys", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 5; i++) {
      s().updatePlaceholder("a", { x_mm: 10 + i }, "gesture:drag-1");
      vi.advanceTimersByTime(2000);
    }
    expect(s().past).toHaveLength(1);
  });

  it("adds, duplicates, reorders and removes placeholders", () => {
    const id = s().duplicatePlaceholder("a")!;
    const copy = s().config!.placeholders.find((p) => p.id === id)!;
    expect(copy.label.endsWith(" copy")).toBe(true);
    expect(copy.x_mm).toBe(7);
    expect(s().selectedId).toBe(id);
    expect(s().config!.layers.map((l) => l.id)).toEqual(["a", id]);
    s().movePlaceholder(id, "down");
    expect(s().config!.layers.map((l) => l.id)).toEqual([id, "a"]);
    s().removePlaceholder(id);
    expect(s().selectedId).toBeNull();
    expect(s().config!.placeholders).toHaveLength(1);
    expect(s().config!.layers).toHaveLength(1);
    s().undo();
    expect(s().config!.placeholders).toHaveLength(2);
  });

  it("adds text layers for old templates without marking them dirty", () => {
    expect(s().config!.layers).toEqual([expect.objectContaining({ id: "a", kind: "text" })]);
    expect(isDirty(s())).toBe(false);
  });

  it("groups, reorders and ungroups layers", () => {
    const img = s().addLayer({ kind: "image", x_mm: 0, y_mm: 0, width_mm: 10, height_mm: 10 });
    const box = s().addLayer({ kind: "shape", x_mm: 20, y_mm: 0, width_mm: 10, height_mm: 10 });
    expect(s().config!.layers.find((l) => l.id === box)!.shape!.type).toBe("rect");
    s().reorder([img], "back");
    expect(s().config!.layers.map((l) => l.id)).toEqual([img, "a", box]);

    const gid = s().group([img, box])!;
    // Members become contiguous at the topmost member's position.
    expect(s().config!.layers.map((l) => l.id)).toEqual(["a", img, box]);
    expect(s().config!.groups.map((g) => g.id)).toEqual([gid]);

    s().reorder([img], "back");
    expect(s().config!.layers.map((l) => l.id)).toEqual([img, box, "a"]);

    s().removeElements([box]);
    expect(s().config!.groups).toHaveLength(0);
    expect(s().config!.layers.find((l) => l.id === img)!.group_id).toBeNull();
  });

  it("aligns and distributes the selection", () => {
    const ids = [0, 7, 30].map((x) => s().addLayer({ kind: "shape", x_mm: x, y_mm: x, width_mm: 10, height_mm: 4 }));
    s().distribute(ids, "h");
    const xs = () => ids.map((id) => s().config!.layers.find((l) => l.id === id)!.x_mm);
    expect(xs()).toEqual([0, 15, 30]);
    s().align(ids, "top");
    expect(ids.map((id) => s().config!.layers.find((l) => l.id === id)!.y_mm)).toEqual([0, 0, 0]);
    s().align([ids[0]], "right");
    expect(xs()[0]).toBeCloseTo(85.6 - 10);
  });
});
