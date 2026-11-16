import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileStack, Gauge, LayoutTemplate, Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, unwrap } from "@/api/client";
import { qk, useJob, useJobs } from "@/api/hooks";
import type { LayoutRequest, LayoutResponse } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { NumberInput } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { SwitchField } from "@/components/ui/switch";
import { JobPanel } from "@/features/jobs/JobPanel";
import { round } from "@/lib/units";
import { formatDate } from "@/lib/utils";

const PAGES: Record<string, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
  SRA3: [320, 450],
};
const FINISHED = new Set(["completed", "completed_with_errors", "cancelled"]);

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const MARK_LEN_MM = 5;
const MARK_OFFSET_MM = 1.5;

/** Mirror of ``pdf_layout.crop_mark_lines``: marks at the trim lines, outside the card grid. */
function cropMarkLines(
  layout: LayoutResponse,
  b: number,
): [number, number, number, number][] {
  const slots = layout.slots;
  if (!slots.length) return [];
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const xs = [
    ...new Set(
      slots.flatMap((s) => [r4(s.x_mm + b), r4(s.x_mm + s.width_mm - b)]),
    ),
  ];
  const ys = [
    ...new Set(
      slots.flatMap((s) => [r4(s.y_mm + b), r4(s.y_mm + s.height_mm - b)]),
    ),
  ];
  const left = Math.min(...slots.map((s) => s.x_mm));
  const right = Math.max(...slots.map((s) => s.x_mm + s.width_mm));
  const top = Math.min(...slots.map((s) => s.y_mm));
  const bottom = Math.max(...slots.map((s) => s.y_mm + s.height_mm));
  const { page_width_mm: pw, page_height_mm: ph } = layout;
  const lines: [number, number, number, number][] = [];
  for (const x of xs) {
    lines.push([
      x,
      Math.max(0, top - MARK_OFFSET_MM - MARK_LEN_MM),
      x,
      Math.max(0, top - MARK_OFFSET_MM),
    ]);
    lines.push([
      x,
      Math.min(ph, bottom + MARK_OFFSET_MM),
      x,
      Math.min(ph, bottom + MARK_OFFSET_MM + MARK_LEN_MM),
    ]);
  }
  for (const y of ys) {
    lines.push([
      Math.max(0, left - MARK_OFFSET_MM - MARK_LEN_MM),
      y,
      Math.max(0, left - MARK_OFFSET_MM),
      y,
    ]);
    lines.push([
      Math.min(pw, right + MARK_OFFSET_MM),
      y,
      Math.min(pw, right + MARK_OFFSET_MM + MARK_LEN_MM),
      y,
    ]);
  }
  return lines.filter(
    ([x1, y1, x2, y2]) => Math.abs(x1 - x2) > 1e-6 || Math.abs(y1 - y2) > 1e-6,
  );
}

function LayoutPreview({
  layout,
  bleedMm,
  cropMarks,
}: {
  layout: LayoutResponse;
  bleedMm: number;
  cropMarks: boolean;
}) {
  const { page_width_mm: W, page_height_mm: H } = layout;
  const slots = layout.slots.slice(0, layout.per_page);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="max-h-[72vh] w-full rounded-sm bg-white shadow-[0_8px_30px_rgba(30,31,39,0.15)]"
      role="img"
      aria-label="Page layout preview"
    >
      {slots.map((s, i) => {
        const b = bleedMm;
        return (
          <g key={i}>
            <rect
              x={s.x_mm}
              y={s.y_mm}
              width={s.width_mm}
              height={s.height_mm}
              className="fill-primary/15 stroke-primary"
              strokeWidth={0.3}
            />
            {b > 0 && (
              <rect
                x={s.x_mm + b}
                y={s.y_mm + b}
                width={s.width_mm - 2 * b}
                height={s.height_mm - 2 * b}
                fill="none"
                className="stroke-primary"
                strokeWidth={0.2}
                strokeDasharray="1 1"
              />
            )}
            <text
              x={s.x_mm + s.width_mm / 2}
              y={s.y_mm + s.height_mm / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.min(s.width_mm, s.height_mm) / 4}
              className="fill-primary/60"
            >
              {i + 1}
            </text>
          </g>
        );
      })}
      {cropMarks &&
        cropMarkLines(layout, bleedMm).map(([x1, y1, x2, y2], i) => (
          <line
            key={`m${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="black"
            strokeWidth={0.25}
          />
        ))}
    </svg>
  );
}

export function PdfPage() {
  const [search, setSearch] = useSearchParams();
  const qc = useQueryClient();
  const { data: jobs } = useJobs("cards");
  const sourceId = search.get("job") ? Number(search.get("job")) : null;
  const pdfJobId = search.get("pdf") ? Number(search.get("pdf")) : null;
  const { data: source } = useJob(sourceId);
  const candidates = useMemo(
    () => (jobs ?? []).filter((j) => FINISHED.has(j.status) && j.has_output),
    [jobs],
  );

  const [pageName, setPageName] = useState("A4");
  const [landscape, setLandscape] = useState(false);
  const [margins, setMargins] = useState({
    top: 10,
    right: 10,
    bottom: 10,
    left: 10,
  });
  const [gap, setGap] = useState(0);
  const [allowRotate, setAllowRotate] = useState(true);
  const [cropMarks, setCropMarks] = useState(true);
  const [dpi, setDpi] = useState("300");
  const [compression, setCompression] = useState("jpeg-95");

  const params = (source?.params ?? {}) as {
    width_mm?: number;
    height_mm?: number;
    bleed_mm?: number;
  };
  const cardW = params.width_mm ?? 0;
  const cardH = params.height_mm ?? 0;
  const bleed = params.bleed_mm ?? 0;
  const [pw, ph] = PAGES[pageName];
  const request: LayoutRequest | null =
    cardW > 0 && source
      ? {
          card_width_mm: cardW,
          card_height_mm: cardH,
          page_width_mm: landscape ? ph : pw,
          page_height_mm: landscape ? pw : ph,
          margins,
          gap_mm: gap,
          allow_rotate: allowRotate,
          card_count:
            source.row_count - source.error_count - source.skipped_count,
        }
      : null;
  const debounced = useDebounced(request, 250);
  const { data: layout, error: layoutError } = useQuery({
    queryKey: ["pdf-layout", debounced],
    queryFn: () => unwrap(api.POST("/api/v1/pdf/layout", { body: debounced! })),
    enabled: !!debounced,
    placeholderData: (prev) => prev,
  });

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/pdf/jobs", {
          body: {
            source_job_id: sourceId!,
            layout: request!,
            crop_marks: cropMarks,
            bleed_mm: bleed,
            dpi: dpi === "original" ? null : Number(dpi),
            image_format: compression === "png" ? "png" : "jpeg",
            jpeg_quality:
              compression === "png" ? 90 : Number(compression.split("-")[1]),
          },
        }),
      ),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: qk.jobs });
      setSearch((s) => {
        s.set("pdf", String(job.id));
        return s;
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const margin = (k: keyof typeof margins) => (
    <Field label={k[0].toUpperCase() + k.slice(1)}>
      <NumberInput
        value={margins[k]}
        min={0}
        step={1}
        onChange={(v) => setMargins((m) => ({ ...m, [k]: v }))}
      />
    </Field>
  );

  const stat = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col items-center rounded-md bg-[#f9fafc] px-2 py-2.5">
      <span className="text-lg font-bold leading-6 text-heading">{value}</span>
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <PageContainer>
      <PageHeader title="Print PDF" crumbs={[{ label: "Print PDF" }]} />
      {candidates.length === 0 && !sourceId ? (
        <Empty
          icon={<Printer />}
          title="No generated cards yet"
          action={
            <Button asChild>
              <Link to="/generate">Generate cards</Link>
            </Button>
          }
        >
          The PDF places your generated card images on printable sheets at their exact physical size, with crop marks.
        </Empty>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,24rem)_1fr]">
          <div className="flex flex-col gap-5">
            <Card>
              <CardHeader>
                <CardTitle>
                  <FileStack className="text-primary" /> Cards
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Field label="Card job">
                  <Select
                    value={sourceId ?? ""}
                    onChange={(e) =>
                      setSearch((s) => {
                        if (e.target.value) s.set("job", e.target.value);
                        else s.delete("job");
                        s.delete("pdf");
                        return s;
                      })
                    }
                  >
                    <option value="">Choose…</option>
                    {candidates.map((j) => (
                      <option key={j.id} value={j.id}>
                        #{j.id} · {j.data_filename} · {j.processed} cards · {formatDate(j.created_at)}
                      </option>
                    ))}
                  </Select>
                </Field>
                {source && (
                  <p className="text-xs text-muted-foreground">
                    Card {round(cardW, 2)} × {round(cardH, 2)} mm
                    {bleed > 0 ? ` incl. ${round(bleed, 2)} mm bleed` : ""}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <LayoutTemplate className="text-primary" /> Page layout
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Page">
                  <Select value={pageName} onChange={(e) => setPageName(e.target.value)}>
                    {Object.entries(PAGES).map(([n, [w, h]]) => (
                      <option key={n} value={n}>
                        {n} ({w} × {h})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Orientation">
                  <Select value={landscape ? "l" : "p"} onChange={(e) => setLandscape(e.target.value === "l")}>
                    <option value="p">Portrait</option>
                    <option value="l">Landscape</option>
                  </Select>
                </Field>
                {margin("top")}
                {margin("bottom")}
                {margin("left")}
                {margin("right")}
                <Field label="Gap (mm)">
                  <NumberInput value={gap} min={0} step={0.5} onChange={setGap} />
                </Field>
                <div />
                <div className="col-span-2 flex flex-col gap-3 border-t border-dashed pt-4">
                  <SwitchField label="Rotate cards if more fit" checked={allowRotate} onChange={setAllowRotate} />
                  <SwitchField label="Crop marks" checked={cropMarks} onChange={setCropMarks} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>
                  <Gauge className="text-primary" /> Output quality
                </CardTitle>
                <CardDescription>Lower resolution and JPEG make much smaller files. 300 DPI is standard print quality.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Image resolution">
                  <Select value={dpi} onChange={(e) => setDpi(e.target.value)}>
                    <option value="150">150 DPI (draft)</option>
                    <option value="300">300 DPI (print)</option>
                    <option value="600">600 DPI (high)</option>
                    <option value="original">Original</option>
                  </Select>
                </Field>
                <Field label="Compression">
                  <Select value={compression} onChange={(e) => setCompression(e.target.value)}>
                    <option value="jpeg-95">JPEG high (95)</option>
                    <option value="jpeg-85">JPEG standard (85)</option>
                    <option value="png">Lossless PNG</option>
                  </Select>
                </Field>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-5 lg:sticky lg:top-0">
            {pdfJobId != null && (
              <Card>
                <CardContent>
                  <JobPanel jobId={pdfJobId} showGallery={false} />
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader
                actions={
                  <Button onClick={() => create.mutate()} disabled={!request || !layout?.per_page || create.isPending}>
                    {create.isPending ? <Loader2 className="animate-spin" /> : <Printer />} Create PDF
                  </Button>
                }
              >
                <CardTitle>Preview</CardTitle>
                <CardDescription>First page of the print sheet</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {layout && (
                  <div className="grid grid-cols-4 gap-2">
                    {stat("Grid", `${layout.columns} × ${layout.rows}`)}
                    {stat("Per page", layout.per_page)}
                    {stat("Pages", layout.pages)}
                    {stat("Rotated", layout.rotated ? "Yes" : "No")}
                  </div>
                )}
                {layout && layout.per_page === 0 && <p className="rounded-md bg-destructive-soft px-4 py-3 text-sm font-semibold text-destructive-text">The card does not fit on the page with these margins.</p>}
                {layoutError && <p className="rounded-md bg-destructive-soft px-4 py-3 text-sm text-destructive-text">{(layoutError as Error).message}</p>}
                <div className="flex justify-center rounded-md bg-[#eef0f5] p-6">
                  {layout && layout.per_page > 0 ? (
                    <div className="w-full max-w-xl">
                      <LayoutPreview layout={layout} bleedMm={bleed} cropMarks={cropMarks} />
                    </div>
                  ) : (
                    <div className="flex h-72 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Printer className="size-8 opacity-40" />
                      Choose a card job to preview the page layout.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
