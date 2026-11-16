import { useEffect, useState } from "react";
import { fileUrl } from "@/api/client";
import type { ImageInfo } from "@/api/types";

/** Browsers cannot display TIFF (and render CMYK inconsistently); use the server's sRGB PNG thumbnail instead. */
export function displayUrl(info: Pick<ImageInfo, "ref" | "format" | "mode"> | undefined | null): string | null {
  if (!info) return null;
  const native = ["PNG", "JPEG", "WEBP", "GIF", "BMP"].includes(info.format) && info.mode !== "CMYK";
  return native ? fileUrl.image(info.ref) : fileUrl.thumbnail(info.ref, 1024);
}

export function useHtmlImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setError(false);
    if (!url) {
      setImage(null);
      return;
    }
    const img = new Image();
    let alive = true;
    img.onload = () => alive && setImage(img);
    img.onerror = () => alive && setError(true);
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return { image, error };
}
