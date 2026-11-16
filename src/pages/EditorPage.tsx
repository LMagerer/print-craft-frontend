import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileStack,
  History,
  Link2,
  Loader2,
  Magnet,
  Plus,
  Redo2,
  Save,
  Scaling,
  ScanEye,
  SquareDashed,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, API_BASE, ApiError, errorMessage, fileUrl, unwrap } from "@/api/client";
import { fetchTemplate, qk, useApplyTemplateDataset, useDataset, useFonts, useRecords, useTemplate } from "@/api/hooks";
import { DatasetPicker } from "@/features/data/DatasetPicker";
import { parseConfig, type GlyphCheckResponse, type RenderReport, type TemplateConfig, type TemplateOut } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tip } from "@/components/ui/tooltip";
import { CardCanvas, type ViewOptions } from "@/features/editor/CardCanvas";
import { MappingDialog } from "@/features/editor/MappingDialog";
import { LayerList, PlaceholderPanel } from "@/features/editor/PlaceholderPanel";
import { SizeDialog } from "@/features/editor/SizeDialog";
import { useCardFonts } from "@/features/editor/useCardFonts";
import { displayUrl, useHtmlImage } from "@/features/editor/useTemplateImage";
import { VersionsDialog } from "@/features/editor/VersionsDialog";
import { prepareText, scaleFor, type PreparedText } from "@/lib/cardPainter";
import { tokenSyntaxErrors, validateTokens } from "@/lib/tokens";
import { round, sizeSummary, type Unit } from "@/lib/units";
import { cn, downloadUrl } from "@/lib/utils";
import { isDirty, useEditor } from "@/stores/editorStore";
import { useSession } from "@/stores/sessionStore";

const NUDGE_MM = 0.5;
const NUDGE_BIG_MM = 5;

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

/** Server-rendered preview (exact Pillow output), debounced. */
function useExactPreview(enabled: boolean, config: TemplateConfig | null, imageRef: string | null, record: Record<string, string> | null) {
  const [state, setState] = useState<{ image: HTMLImageElement | null; report: RenderReport[]; loading: boolean; error: string | null }>({
    image: null,
    report: [],
    loading: false,
    error: null,
  });
  const body = useMemo(() => (enabled && config && imageRef ? JSON.stringify({ config, image_ref: imageRef, record, max_width: 2400 }) : null), [enabled, config, imageRef, record]);

  useEffect(() => {
    if (!body) {
      setState({ image: null, report: [], loading: false, error: null });
      return;
    }
    const ctrl = new AbortController();
    let url: string | null = null;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/render/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctrl.signal });
        if (!res.ok) throw new ApiError(errorMessage(await res.json().catch(() => null), res.statusText), res.status);
        const report = JSON.parse(decodeURIComponent(res.headers.get("X-Render-Report") ?? "%5B%5D")) as RenderReport[];
        url = URL.createObjectURL(await res.blob());
        const img = new Image();
        img.src = url;
        await img.decode();
        if (!ctrl.signal.aborted) setState({ image: img, report, loading: false, error: null });
      } catch (e) {
        if (!ctrl.signal.aborted) setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(t);
      if (url) URL.revokeObjectURL(url);
    };
  }, [body]);
  return state;
}

export function EditorPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: template, error: loadError } = useTemplate(Number.isFinite(id) ? id : null);
  useApplyTemplateDataset(template);
  const { data: fontData } = useFonts();
  const lib = fontData?.lib;

  const config = useEditor((s) => s.config);
  const selectedId = useEditor((s) => s.selectedId);
  const dirtyConfig = useEditor(isDirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const { load, undo, redo, select, addPlaceholder, removePlaceholder, duplicatePlaceholder, updatePlaceholder, markSaved, apply } = useEditor.getState();

  const [meta, setMeta] = useState({ name: "", description: "" });
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [view, setView] = useState<ViewOptions>({ snap: true, gridMm: 0.5, showFrames: true });
  const [unit, setUnit] = useState<Unit>("mm");
  const [exact, setExact] = useState(false);
  const [useRecord, setUseRecord] = useState(true);
  const [dialog, setDialog] = useState<null | "size" | "mapping" | "versions">(null);
  const [glyphReport, setGlyphReport] = useState<GlyphCheckResponse | null>(null);

  // Load the template into the editor store (once per template version).
  useEffect(() => {
    if (!template) return;
    const key = `${template.id}:${template.version}`;
    if (key === loadedVersion) return;
    load(template.id, template.config);
    setMeta({ name: template.name, description: template.description });
    setLoadedVersion(key);
  }, [template, loadedVersion, load]);

  const dirtyMeta = !!template && (meta.name !== template.name || meta.description !== template.description);
  const dirty = dirtyConfig || dirtyMeta;

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Data record for the preview.
  const datasetId = useSession((s) => s.datasetId);
  const recordIndex = useSession((s) => s.recordIndex);
  const setRecordIndex = useSession((s) => s.setRecordIndex);
  const { data: dataset } = useDataset(datasetId);
  const { data: page } = useRecords(dataset ? datasetId : null, Math.min(recordIndex, Math.max(0, (dataset?.row_count ?? 1) - 1)), 1);
  const fields = dataset?.fields ?? [];
  const record = useRecord && dataset && page?.records[0] ? page.records[0] : null;

  // Image + fonts.
  const imageRef = template?.image_sha256 ?? null;
  const { data: imageInfo } = useQuery({
    queryKey: ["image-info", imageRef],
    queryFn: () => unwrap(api.GET("/api/v1/images/{ref}/info", { params: { path: { ref: imageRef! } } })),
    enabled: !!imageRef,
    staleTime: Infinity,
  });
  const { image } = useHtmlImage(displayUrl(imageInfo));
  const { metrics, ready: fontsReady, error: fontError } = useCardFonts(config, lib);

  const scale = useMemo(() => (config && template ? scaleFor(config, template.width_px) : { pxPerMm: 1, dpi: 25.4 }), [config, template]);
  const prepared = useMemo(() => {
    const out = new Map<string, PreparedText>();
    if (!config || !lib) return out;
    for (const p of config.placeholders) {
      const prep = prepareText(p, record, scale, lib, metrics);
      if (prep) out.set(p.id, prep);
    }
    return out;
  }, [config, lib, metrics, record, scale]);

  const exactPreview = useExactPreview(exact, config, imageRef, record);

  // Saving.
  const save = useMutation({
    mutationFn: async (extra?: { image_ref?: string; config?: TemplateConfig }) => {
      const cfg = extra?.config ?? useEditor.getState().config!;
      return unwrap(
        api.PUT("/api/v1/templates/{template_id}", {
          params: { path: { template_id: id } },
          body: { name: meta.name.trim() || template!.name, description: meta.description, config: cfg as never, image_ref: extra?.image_ref ?? null },
        }),
      );
    },
    onSuccess: (t) => {
      markSaved();
      qc.setQueryData(qk.template(id), { ...t, config: parseConfig(t.config) } as TemplateOut);
      setLoadedVersion(`${t.id}:${t.version}`);
      qc.invalidateQueries({ queryKey: qk.templates, exact: false, refetchType: "none" });
      qc.invalidateQueries({ queryKey: qk.versions(id) });
      toast.success(`Saved (version ${t.version})`);
    },
    onError: (e: Error) => toast.error(`Save failed: ${e.message}`),
  });

  const reloadFromServer = useCallback(async () => {
    const t = await qc.fetchQuery({ queryKey: qk.template(id), queryFn: () => fetchTemplate(id), staleTime: 0 });
    load(t.id, t.config);
    setMeta({ name: t.name, description: t.description });
    setLoadedVersion(`${t.id}:${t.version}`);
  }, [id, load, qc]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!save.isPending) save.mutate(undefined);
        return;
      }
      if (isTyping(e) || dialog) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault();
        duplicatePlaceholder(selectedId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removePlaceholder(selectedId);
      } else if (e.key === "Escape") {
        select(null);
      } else if (e.key.startsWith("Arrow") && selectedId) {
        const p = useEditor.getState().config?.placeholders.find((q) => q.id === selectedId);
        if (!p || p.locked) return;
        e.preventDefault();
        const d = e.shiftKey ? NUDGE_BIG_MM : e.altKey ? 0.1 : NUDGE_MM;
        const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
        const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
        updatePlaceholder(selectedId, { x_mm: round(p.x_mm + dx, 3), y_mm: round(p.y_mm + dy, 3) }, `nudge:${selectedId}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, duplicatePlaceholder, redo, removePlaceholder, save, select, selectedId, undo, updatePlaceholder]);

  const glyphCheck = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/render/glyph-check", { body: { config: config as never, dataset_id: datasetId } })),
    onSuccess: (r) => {
      setGlyphReport(r);
      if (!r.placeholders.length) toast.success(`All glyphs available in ${r.checked_rows} rows`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loadError) {
    return (
      <div className="p-8">
        <p className="text-destructive-text">Could not load template: {(loadError as Error).message}</p>
        <Link to="/" className="text-primary underline">
          Back to library
        </Link>
      </div>
    );
  }
  if (!template || !config || !lib) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading editor…
      </div>
    );
  }

  const selected = config.placeholders.find((p) => p.id === selectedId) ?? null;
  const problems = [...prepared.values()].filter((p) => !p.placeholder.hidden && (p.layout.overflow || p.layout.missing.length || p.missingFields.length));
  const filenamePattern = config.output.filename_field ?? "";
  const filenameUnknown = fields.length && filenamePattern ? (filenamePattern.includes("{{") ? validateTokens(filenamePattern, fields) : fields.includes(filenamePattern) ? [] : [filenamePattern]) : [];
  const totalRows = dataset?.row_count ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-card px-3 py-2 shadow-card">
        <Tip content="Back to library">
          <Button size="icon" variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft />
          </Button>
        </Tip>
        <div className="mr-2 min-w-0">
          <div className="truncate text-sm font-semibold">
            {meta.name || template.name} {dirty && <span className="text-warning-text">•</span>}
          </div>
          <div className="text-[11px] text-muted-foreground">
            v{template.version} · {sizeSummary(config.size.width_mm, config.size.height_mm, template.width_px, template.height_px)}
          </div>
        </div>
        <div className="mx-1 h-6 w-px bg-border" />
        <Tip content="Undo (Ctrl+Z)">
          <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo}>
            <Undo2 />
          </Button>
        </Tip>
        <Tip content="Redo (Ctrl+Shift+Z / Ctrl+Y)">
          <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo}>
            <Redo2 />
          </Button>
        </Tip>
        <Button size="sm" variant="ghost" onClick={() => addPlaceholder({ x_mm: round(config.size.width_mm / 2 - 20, 2), y_mm: round(config.size.height_mm / 2 - 4, 2) })}>
          <Plus /> Placeholder
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog("mapping")}>
          <Link2 /> Mapping
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog("size")} disabled={dirtyConfig}>
          <Scaling /> Size
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDialog("versions")}>
          <History /> Versions
        </Button>
        <Tip content="Export template (.zip with image, config and fonts)">
          <Button size="icon" variant="ghost" onClick={() => downloadUrl(fileUrl.templateExport(id))}>
            <Download />
          </Button>
        </Tip>
        <div className="mx-1 h-6 w-px bg-border" />
        <Tip content="Snap to grid, card edges and other boxes">
          <Button size="icon" variant={view.snap ? "secondary" : "ghost"} onClick={() => setView((v) => ({ ...v, snap: !v.snap }))} aria-pressed={view.snap}>
            <Magnet />
          </Button>
        </Tip>
        <Tip content="Show placeholder frames">
          <Button size="icon" variant={view.showFrames ? "secondary" : "ghost"} onClick={() => setView((v) => ({ ...v, showFrames: !v.showFrames }))} aria-pressed={view.showFrames}>
            <SquareDashed />
          </Button>
        </Tip>
        <Select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="h-8 w-16" aria-label="Units">
          {(["mm", "cm", "in", "pt", "px"] as Unit[]).map((u) => (
            <option key={u}>{u}</option>
          ))}
        </Select>
        <div className="mx-1 h-6 w-px bg-border" />
        <Tip content={exact ? "Exact: rendered by the server exactly as the final output" : "Fast: live canvas preview (same layout, browser rasteriser)"}>
          <Button size="sm" variant={exact ? "secondary" : "ghost"} onClick={() => setExact((v) => !v)} aria-pressed={exact}>
            {exactPreview.loading ? <Loader2 className="animate-spin" /> : <ScanEye />} {exact ? "Exact preview" : "Fast preview"}
          </Button>
        </Tip>
        {/* Record navigator */}
        <div className="flex items-center gap-1 rounded-md border px-1">
          <Select
            value={useRecord && dataset ? "record" : "sample"}
            onChange={(e) => setUseRecord(e.target.value === "record")}
            className="h-7 w-28 border-0 shadow-none"
            disabled={!dataset}
            aria-label="Preview content"
          >
            <option value="sample">Sample text</option>
            <option value="record">Data row</option>
          </Select>
          {dataset && useRecord && (
            <>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRecordIndex(recordIndex - 1)} disabled={recordIndex <= 0}>
                <ChevronLeft />
              </Button>
              <NumberInput value={Math.min(recordIndex, totalRows - 1) + 1} min={1} max={totalRows} step={1} onChange={(v) => setRecordIndex(Math.round(v) - 1)} className="h-7 w-16" aria-label="Row" />
              <span className="text-xs text-muted-foreground">/ {totalRows}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRecordIndex(recordIndex + 1)} disabled={recordIndex >= totalRows - 1}>
                <ChevronRight />
              </Button>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {problems.length > 0 && <Badge variant="destructive">{problems.length} issue{problems.length > 1 ? "s" : ""}</Badge>}
          <Button size="sm" variant="outline" onClick={() => navigate(`/generate?template=${id}`)} disabled={dirty}>
            <FileStack /> Generate
          </Button>
          <Button size="sm" onClick={() => save.mutate(undefined)} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: template settings + layers */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r bg-card">
          <div className="flex flex-col gap-2 border-b p-3">
            <Field label="Name">
              <Input value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} aria-invalid={!meta.name.trim()} />
            </Field>
            <Field label="Description">
              <Textarea value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))} rows={2} />
            </Field>
            <Field label="Data" hint="Saved with the template and selected automatically next time.">
              <DatasetPicker templateId={template?.id ?? null} linkedId={template?.dataset_id} compact />
            </Field>
            <Field
              label="Output file name"
              hint="A field name or a pattern like {{LastName}}_{{FirstName}}"
              error={tokenSyntaxErrors(filenamePattern)[0] ?? (filenameUnknown.length ? `Unknown: ${filenameUnknown.join(", ")}` : undefined)}
            >
              <Input
                value={filenamePattern}
                onChange={(e) => apply((c) => ({ ...c, output: { ...c.output, filename_field: e.target.value || null } }), "output.filename")}
                list="tc-fields"
                className="font-mono text-xs"
              />
              <datalist id="tc-fields">
                {fields.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
          </div>
          <LayerList prepared={prepared} />
          <div className="mt-auto flex flex-col gap-2 border-t p-3 text-xs">
            {fontError && <p className="text-destructive-text">Font loading failed: {fontError}</p>}
            {!fontsReady && <p className="text-muted-foreground">Loading fonts…</p>}
            {dataset && (
              <Button size="sm" variant="outline" onClick={() => glyphCheck.mutate()} disabled={glyphCheck.isPending}>
                {glyphCheck.isPending && <Loader2 className="animate-spin" />} Check glyphs in all rows
              </Button>
            )}
            {glyphReport && glyphReport.placeholders.length > 0 && (
              <div className="rounded border border-destructive/40 bg-destructive-soft p-2 text-destructive-text">
                <p className="font-medium">Missing glyphs ({glyphReport.checked_rows} rows checked)</p>
                {glyphReport.placeholders.map((g) => (
                  <p key={g.placeholder_id}>
                    {config.placeholders.find((p) => p.id === g.placeholder_id)?.label ?? g.placeholder_id}: {Object.keys(g.missing).join(" ")} — rows{" "}
                    {g.rows.slice(0, 8).map((r) => r + 1).join(", ")}
                    {g.rows.length > 8 ? "…" : ""}
                  </p>
                ))}
              </div>
            )}
            {exact && exactPreview.error && <p className="text-destructive-text">Preview failed: {exactPreview.error}</p>}
            {exact && exactPreview.report.some((r) => r.overflow || r.missing_glyphs.length) && (
              <div className="rounded border p-2">
                <p className="font-medium">Server render report</p>
                {exactPreview.report
                  .filter((r) => r.overflow || r.missing_glyphs.length)
                  .map((r) => (
                    <p key={r.id} className="text-destructive-text">
                      {r.id}: {r.overflow ? "overflow" : ""} {r.missing_glyphs.length ? `missing ${r.missing_glyphs.join(" ")}` : ""}
                    </p>
                  ))}
              </div>
            )}
          </div>
        </aside>

        {/* Canvas */}
        <div className={cn("relative min-w-0 flex-1", !fontsReady && "opacity-80")}>
          <CardCanvas
            config={config}
            widthPx={template.width_px}
            heightPx={template.height_px}
            image={image}
            exactImage={exact ? exactPreview.image : null}
            prepared={fontsReady ? prepared : new Map()}
            scale={scale}
            view={view}
          />
          <div className="pointer-events-none absolute bottom-3 left-8 right-48 truncate rounded-full bg-card/90 px-3 py-1 text-[11px] shadow-card text-muted-foreground">
            Drag to move · handles resize · arrows nudge 0.5 mm (Shift 5 mm, Alt 0.1 mm) · Space+drag or scroll to pan · Ctrl+scroll to zoom
          </div>
        </div>

        {/* Right: properties */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l bg-card">
          {selected ? (
            <PlaceholderPanel key={selected.id} placeholder={selected} prepared={prepared.get(selected.id)} lib={lib} fields={fields} unit={unit} dpi={scale.dpi} />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">Select a placeholder on the card or in the list to edit it.</div>
          )}
        </aside>
      </div>

      <SizeDialog
        open={dialog === "size"}
        onOpenChange={(o) => setDialog(o ? "size" : null)}
        template={template}
        imageRef={imageRef!}
        config={config}
        onApplied={async (ref, cfg) => {
          await save.mutateAsync({ image_ref: ref, config: cfg });
          await reloadFromServer();
        }}
      />
      <MappingDialog open={dialog === "mapping"} onOpenChange={(o) => setDialog(o ? "mapping" : null)} config={config} fields={fields} />
      {dialog === "versions" && <VersionsDialog open onOpenChange={(o) => setDialog(o ? "versions" : null)} templateId={id} current={template.version} onRestored={reloadFromServer} />}
    </div>
  );
}
