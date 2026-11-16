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
    s().movePlaceholder(id, "down");
    expect(s().config!.placeholders.map((p) => p.id)).toEqual([id, "a"]);
    s().removePlaceholder(id);
    expect(s().selectedId).toBeNull();
    expect(s().config!.placeholders).toHaveLength(1);
    s().undo();
    expect(s().config!.placeholders).toHaveLength(2);
  });
});
