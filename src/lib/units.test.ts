import { describe, expect, it } from "vitest";
import { dpiFor, fromMm, pixelsFor, sizeSummary, toMm } from "./units";

describe("units", () => {
  it("round-trips every unit through mm", () => {
    for (const unit of ["mm", "cm", "in", "pt", "px"] as const) expect(toMm(fromMm(85.6, unit, 300), unit, 300)).toBeCloseTo(85.6, 9);
  });
  it("converts known values", () => {
    expect(toMm(1, "in")).toBe(25.4);
    expect(toMm(72, "pt")).toBeCloseTo(25.4, 9);
    expect(fromMm(25.4, "px", 300)).toBeCloseTo(300, 9);
    expect(toMm(3, "cm")).toBe(30);
  });
  it("derives DPI and pixel counts", () => {
    expect(dpiFor(1011, 85.6)).toBeCloseTo(300, 0);
    expect(pixelsFor(85.6, 300)).toBe(1011);
    expect(pixelsFor(0.001, 1)).toBe(1);
    expect(sizeSummary(85.6, 54, 1011, 638)).toBe("85.6 × 54.0 mm | 1011 × 638 px | 300 DPI");
  });
});
