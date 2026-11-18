/** Match a data value to an uploaded photo, with the same rules as the server's ``PhotoResolver``. */
import type { PhotoEntry } from "@/api/types";

const SHA_RE = /^[0-9a-f]{64}$/;

interface Index {
  exact: Map<string, string>;
  lower: Map<string, string>;
  stems: Map<string, string>;
}

const indexes = new WeakMap<readonly PhotoEntry[], Index>();
const baseName = (v: string) => v.replace(/\\/g, "/").split("/").pop()!.trim();
const stem = (name: string) => (name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name);

function indexOf(photos: readonly PhotoEntry[]): Index {
  let idx = indexes.get(photos);
  if (!idx) {
    idx = { exact: new Map(), lower: new Map(), stems: new Map() };
    for (const p of photos) {
      idx.exact.set(p.name, p.ref);
      if (!idx.lower.has(p.name.toLowerCase())) idx.lower.set(p.name.toLowerCase(), p.ref);
      if (!idx.stems.has(stem(p.name).toLowerCase())) idx.stems.set(stem(p.name).toLowerCase(), p.ref);
    }
    indexes.set(photos, idx);
  }
  return idx;
}

/** Photo ref for a cell value: a SHA-256 ref, then the exact file name, then case-insensitive, then without extension. */
export function photoRefFor(value: string | null | undefined, photos: readonly PhotoEntry[]): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (SHA_RE.test(v)) return v;
  const name = baseName(v);
  const idx = indexOf(photos);
  return idx.exact.get(name) ?? idx.lower.get(name.toLowerCase()) ?? idx.stems.get(stem(name).toLowerCase()) ?? null;
}
