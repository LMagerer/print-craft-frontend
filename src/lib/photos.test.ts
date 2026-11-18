import { describe, expect, it } from "vitest";
import { photoRefFor } from "./photos";

const photos = [
  { name: "Anna.JPG", ref: "a".repeat(64) },
  { name: "bob.png", ref: "b".repeat(64) },
];

describe("photoRefFor", () => {
  it("matches like the server", () => {
    expect(photoRefFor("Anna.JPG", photos)).toBe("a".repeat(64));
    expect(photoRefFor("C:\\pics\\anna.jpg", photos)).toBe("a".repeat(64));
    expect(photoRefFor(" BOB ", photos)).toBe("b".repeat(64));
    expect(photoRefFor("c".repeat(64), photos)).toBe("c".repeat(64));
    expect(photoRefFor("carol.png", photos)).toBeNull();
    expect(photoRefFor("", photos)).toBeNull();
  });
});
