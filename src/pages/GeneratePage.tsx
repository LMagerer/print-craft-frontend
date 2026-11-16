import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Database, FileSpreadsheet, FileStack, LayoutGrid, Loader2, Play, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { api, fileUrl, unwrap } from "@/api/client";
import { qk, useApplyTemplateDataset, useDataset, useDatasets, useTemplate, useTemplates } from "@/api/hooks";
import { DatasetPicker } from "@/features/data/DatasetPicker";
import type { JobCreate } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { IconAvatar } from "@/components/ui/icon-avatar";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { JobPanel } from "@/features/jobs/JobPanel";
import { bindingFields, tokenSyntaxErrors, validateTokens } from "@/lib/tokens";
import { round } from "@/lib/units";
import { useSession } from "@/stores/sessionStore";

/** Parse "1-10, 15, 20-" (1-based, inclusive) into sorted 0-based row indexes. */
export function parseRowSelection(text: string, total: number): { rows: number[] | null; error: string | null } {
  const t = text.trim();
  if (!t) return { rows: null, error: null };
  const out = new Set<number>();
  for (const part of t.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)?(?:(-)(\d+)?)?$/.exec(part);
    if (!m || (!m[1] && !m[3])) return { rows: null, error: `Invalid range “${part}”` };
    const a = m[1] ? Number(m[1]) : 1;
    const b = m[2] ? (m[3] ? Number(m[3]) : total) : a;
    if (a < 1 || b > total || a > b) return { rows: null, error: `“${part}” is outside 1–${total}` };
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return { rows: [...out].sort((x, y) => x - y), error: null };
}

export function GeneratePage() {
  const [search, setSearch] = useSearchParams();
  const qc = useQueryClient();
  const datasetId = useSession((s) => s.datasetId);
  const { data: dataset } = useDataset(datasetId);
  const { data: templates } = useTemplates({ sort: "updated_at", order: "desc" });
  const templateId = search.get("template") ? Number(search.get("template")) : null;
  const { data: template } = useTemplate(templateId);
  const { data: datasets } = useDatasets();
  useApplyTemplateDataset(template);
  const jobParam = search.get("job");
  const jobId = jobParam ? Number(jobParam) : null;

  const [filenameField, setFilenameField] = useState("");
  const [emptyPolicy, setEmptyPolicy] = useState<JobCreate["empty_policy"]>("render");
  const [fillValue, setFillValue] = useState("");
  const [rowsText, setRowsText] = useState("");

  useEffect(() => {
    setFilenameField(template?.config.output.filename_field ?? "");
  }, [template]);

  const fields = dataset?.fields ?? [];
  const total = dataset?.row_count ?? 0;
  const selection = useMemo(() => parseRowSelection(rowsText, total), [rowsText, total]);

  const missingFields = useMemo(() => {
    if (!template || !dataset) return [];
    const used = template.config.placeholders.filter((p) => !p.hidden).flatMap((p) => bindingFields(p.binding));
    return [...new Set(used)].filter((f) => !fields.includes(f));
  }, [template, dataset, fields]);
  const filenameErrors = filenameField.includes("{{")
    ? [...tokenSyntaxErrors(filenameField), ...validateTokens(filenameField, fields).map((f) => `Unknown field ${f}`)]
    : filenameField && fields.length && !fields.includes(filenameField)
      ? [`Unknown field ${filenameField}`]
      : [];

  const start = useMutation({
    mutationFn: () =>
      unwrap(
        api.POST("/api/v1/jobs", {
          body: {
            template_id: templateId!,
            dataset_id: datasetId!,
            filename_field: filenameField || null,
            rows: selection.rows,
            empty_policy: emptyPolicy,
            fill_value: fillValue,
            config: null,
          },
        }),
      ),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: qk.jobs });
      setSearch((s) => {
        s.set("job", String(job.id));
        return s;
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const count = selection.rows?.length ?? total;
  const canStart = !!template && !!dataset && !selection.error && count > 0 && !filenameErrors.length && !start.isPending;

  return (
    <PageContainer>
      <PageHeader title="Generate cards" crumbs={[{ label: "Generate cards" }]} />
      {datasets && datasets.length === 0 ? (
        <Empty
          icon={<Database />}
          title="No data uploaded"
          action={
            <Button asChild>
              <Link to="/data">Load a data file</Link>
            </Button>
          }
        >
          Cards are rendered from one row of data each. Load a spreadsheet first, then come back here.
        </Empty>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader>
              <CardTitle>
                <Settings2 className="text-primary" /> Settings
              </CardTitle>
              <CardDescription>Choose a template and how rows map to files.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Template" className="sm:col-span-2">
                <Select
                  value={templateId ?? ""}
                  onChange={(e) =>
                    setSearch((s) => {
                      if (e.target.value) s.set("template", e.target.value);
                      else s.delete("template");
                      s.delete("job");
                      return s;
                    })
                  }
                >
                  <option value="">Choose a template…</option>
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({round(t.width_mm, 1)} × {round(t.height_mm, 1)} mm)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Data"
                className="sm:col-span-2"
                hint={template ? "Your choice is saved with the template and selected again next time." : "Choose a template to save the data choice with it."}
              >
                <DatasetPicker templateId={templateId} linkedId={template?.dataset_id} />
              </Field>
              <Field
                label="File name"
                className="sm:col-span-2"
                hint="Field name or pattern like {{LastName}}_{{FirstName}}; duplicates get _2, _3 … Empty = card_00001"
                error={filenameErrors[0]}
              >
                <Input value={filenameField} onChange={(e) => setFilenameField(e.target.value)} list="gen-fields" className="font-mono text-xs" placeholder="card_00001.png" />
                <datalist id="gen-fields">
                  {fields.map((f) => (
                    <option key={f} value={f} />
                  ))}
                </datalist>
              </Field>
              <Field label="Empty values">
                <Select value={emptyPolicy} onChange={(e) => setEmptyPolicy(e.target.value as JobCreate["empty_policy"])}>
                  <option value="render">Render anyway (leave blank, warn)</option>
                  <option value="skip">Skip the row</option>
                  <option value="fill">Fill with a value</option>
                </Select>
              </Field>
              {emptyPolicy === "fill" ? (
                <Field label="Fill value">
                  <Input value={fillValue} onChange={(e) => setFillValue(e.target.value)} placeholder="e.g. —" />
                </Field>
              ) : (
                <div className="hidden sm:block" />
              )}
              <Field label="Rows" className="sm:col-span-2" hint={`Leave empty for all ${total} rows, or e.g. 1-10, 15, 40-`} error={selection.error ?? undefined}>
                <Input value={rowsText} onChange={(e) => setRowsText(e.target.value)} placeholder={`1-${total}`} />
              </Field>
            </CardContent>
          </Card>

          <Card className="lg:sticky lg:top-0">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-[#f1f3f8] p-3">
                {template ? (
                  <img src={fileUrl.thumbnail(template.image_sha256, 480)} alt={template.name} className="max-h-full max-w-full rounded object-contain shadow-[0_4px_14px_rgba(30,31,39,0.18)]" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                    <LayoutGrid className="size-8 opacity-40" /> No template selected
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3">
                <IconAvatar size="sm" tone="info" icon={<FileSpreadsheet />} />
                {dataset ? (
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-bold text-heading">{dataset.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {dataset.sheet ? `${dataset.sheet} · ` : ""}
                      {dataset.row_count} rows · {fields.length} columns
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No data selected</div>
                )}
              </div>
              <div className="flex items-center justify-between rounded-md bg-primary-soft/60 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Cards to render</span>
                <span className="text-2xl font-bold text-heading">{count}</span>
              </div>
              {missingFields.length > 0 && (
                <div className="flex gap-2 rounded-md bg-warning-soft p-3 text-xs text-warning-text">
                  <AlertTriangle className="size-4 shrink-0" />
                  <div>
                    Fields used by the template but missing in the data:{" "}
                    {missingFields.map((f) => (
                      <Badge key={f} variant="warning" className="mr-1 bg-white/70">
                        {f}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {template && !filenameField && <p className="text-xs text-muted-foreground">No file name field set; numbered names are used.</p>}
              <Button size="lg" onClick={() => start.mutate()} disabled={!canStart} className="w-full">
                {start.isPending ? <Loader2 className="animate-spin" /> : <Play />} Generate {count} card{count === 1 ? "" : "s"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {jobId != null && (
        <Card>
          <CardHeader>
            <CardTitle>
              <FileStack className="text-primary" /> Job progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <JobPanel
              jobId={jobId}
              onDeleted={() =>
                setSearch((s) => {
                  s.delete("job");
                  return s;
                })
              }
            />
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
