import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api, fileUrl, unwrap } from "@/api/client";
import type { Layer, PhotoEntry, Record_, TemplateConfig } from "@/api/types";
import { photoRefFor } from "@/lib/photos";

const NO_PHOTOS: PhotoEntry[] = [];

export function usePhotos() {
  const { data } = useQuery({
    queryKey: ["photos"],
    queryFn: () => unwrap(api.GET("/api/v1/photos")) as Promise<PhotoEntry[]>,
    staleTime: 60_000,
  });
  return data ?? NO_PHOTOS;
}

/** Image shown for an image layer: the static image, or the record's photo (falling back to the sample `ref`). */
export function layerImageRef(l: Layer, record: Record_ | null, photos: readonly PhotoEntry[]): { ref: string | null; missing: boolean } {
  const src = l.image;
  if (!src) return { ref: null, missing: false };
  if (src.mode === "static" || !record || !src.field) return { ref: src.ref, missing: false };
  const value = record[src.field];
  const ref = photoRefFor(value, photos);
  return ref ? { ref, missing: false } : { ref: src.ref, missing: !!value?.trim() || !(src.field in record) };
}

type Entry = HTMLImageElement | "loading" | "error";
const cache = new Map<string, Entry>();

/** Load (and cache) the images of all image layers; returns layer id -> loaded image. */
export function useLayerImages(config: TemplateConfig | null, record: Record_ | null, photos: readonly PhotoEntry[]) {
  const [, bump] = useState(0);
  const refs = useMemo(() => {
    const out = new Map<string, string>();
    for (const l of config?.layers ?? []) {
      if (l.kind !== "image") continue;
      const { ref } = layerImageRef(l, record, photos);
      if (ref) out.set(l.id, ref);
    }
    return out;
  }, [config?.layers, record, photos]);

  useEffect(() => {
    let alive = true;
    for (const ref of new Set(refs.values())) {
      if (cache.has(ref)) continue;
      cache.set(ref, "loading");
      const img = new Image();
      img.onload = () => {
        cache.set(ref, img);
        if (alive) bump((n) => n + 1);
      };
      img.onerror = () => {
        cache.set(ref, "error");
        if (alive) bump((n) => n + 1);
      };
      img.src = fileUrl.display(ref);
    }
    return () => {
      alive = false;
    };
  }, [refs]);

  const out = new Map<string, HTMLImageElement>();
  for (const [id, ref] of refs) {
    const e = cache.get(ref);
    if (e instanceof HTMLImageElement) out.set(id, e);
  }
  return out;
}
