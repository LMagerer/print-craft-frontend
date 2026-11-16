import { useEffect, useMemo, useState } from "react";
import type { TemplateConfig } from "@/api/types";
import { requiredFontIds } from "@/lib/cardPainter";
import { loadFont, type FontLibrary } from "@/lib/fonts";
import type { FontMetrics } from "@/lib/textLayout";

/** Loads metrics and browser font faces for every font the config uses. */
export function useCardFonts(config: TemplateConfig | null, lib: FontLibrary | undefined) {
  const [metrics, setMetrics] = useState<Map<number, FontMetrics>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const ids = useMemo(() => (config && lib ? requiredFontIds(config, lib) : []), [config, lib]);
  const key = ids.join(",");

  useEffect(() => {
    let cancelled = false;
    const missing = ids.filter((id) => !metrics.has(id));
    if (!missing.length) return;
    Promise.all(missing.map(async (id) => [id, await loadFont(id)] as const))
      .then((loaded) => {
        if (cancelled) return;
        setMetrics((prev) => {
          const next = new Map(prev);
          for (const [id, m] of loaded) next.set(id, m);
          return next;
        });
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const ready = ids.every((id) => metrics.has(id));
  return { metrics, ready, error };
}
