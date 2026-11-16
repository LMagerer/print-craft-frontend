import { describe, expect, it } from "vitest";
import { snapPosition } from "./geometry";

const card = { w: 85.6, h: 54, bleed: 3 };
const opts = { grid: 0.5, tolMm: 1, snap: true };

describe("snapPosition", () => {
  it("snaps to the grid when nothing is near", () => {
    const r = snapPosition(20.3 * 10, 20.1 * 10, 10, { w: 10, h: 5 }, card, [], opts);
    expect(r).toEqual({ x: 20.5, y: 20, guides: [] });
  });
  it("snaps edges to the bleed line and centre to the card centre", () => {
    const r = snapPosition(3.4 * 10, (27 - 2.5 + 0.6) * 10, 10, { w: 10, h: 5 }, card, [], opts);
    expect(r.x).toBe(3);
    expect(r.y).toBe(24.5);
    expect(r.guides).toEqual([
      { orientation: "v", pos: 3 },
      { orientation: "h", pos: 27 },
    ]);
  });
  it("aligns with other boxes", () => {
    const r = snapPosition(40.7 * 10, 10.2 * 10, 10, { w: 10, h: 5 }, card, [{ x: 40, y: 30, w: 20, h: 5 }], opts);
    expect(r.x).toBe(40);
  });
  it("does nothing when snapping is off", () => {
    expect(snapPosition(123.4567, 10, 10, { w: 1, h: 1 }, card, [], { ...opts, snap: false })).toEqual({ x: 12.346, y: 1, guides: [] });
  });
});
