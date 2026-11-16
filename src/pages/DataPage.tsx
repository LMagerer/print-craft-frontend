import { useMutation, useQueryClient } from "@tanstack/react-query";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardPaste, Database, FileJson, FileSpreadsheet, Files, Loader2, Trash2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, postForm, unwrap } from "@/api/client";
import { fetchTemplate, qk, useDataset, useDatasets, useRecords, useTemplates } from "@/api/hooks";
import type { DatasetOut, Record_, ValidateResponse } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { Textarea } from "@/components/ui/input";
import { IconAvatar } from "@/components/ui/icon-avatar";
import { Field } from "@/components/ui/label";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { bindingFields, extractTokens } from "@/lib/tokens";
import { formatDate } from "@/lib/utils";
import { useSession } from "@/stores/sessionStore";

const ACCEPT = ".xlsx,.xlsm,.xls,.csv,.tsv,.txt,.json";
const PAGE_SIZES = [25, 50, 100, 250];

// The last uploaded file is kept in memory so another Excel sheet can be selected without re-picking it.
let lastFile: File | null = null;

function rowsLabel(rows: number[], total: number) {
  const shown = rows.slice(0, 12).map((r) => r + 1).join(", ");
  return total > 12 ? `${shown}, … (${total})` : shown;
}

export function DataPage() {
  const datasetId = useSession((s) => s.datasetId);
  const setDataset = useSession((s) => s.setDataset);
  const { data: dataset, error: datasetError } = useDataset(datasetId);
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const { data: page, isFetching } = useRecords(dataset ? datasetId : null, offset, pageSize);
  const [paste, setPaste] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [templateId, setTemplateId] = useState<number | "">("");
  const { data: templates } = useTemplates({ sort: "updated_at", order: "desc" });
  const fileInput = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data: datasets } = useDatasets();

  const upload = useMutation({
    mutationFn: async (arg: { file?: File; text?: string; sheet?: string }) => {
      const form = new FormData();
      if (arg.file) form.append("file", arg.file);
      if (arg.text != null) form.append("text", arg.text);
      if (arg.sheet) form.append("sheet", arg.sheet);
      return postForm<DatasetOut>("/datasets", form);
    },
    onSuccess: (d, arg) => {
      if (arg.file) lastFile = arg.file;
      qc.invalidateQueries({ queryKey: qk.datasets });
      setDataset(d.id);
      setOffset(0);
      setValidation(null);
      setPaste(null);
      toast.success(`Loaded ${d.row_count} rows · ${d.fields.length} columns`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validate = useMutation({
    mutationFn: async () => {
      let required: string[] = [];
      let filenameField: string | null = null;
      if (templateId !== "") {
        const t = await fetchTemplate(templateId);
        required = [...new Set(t.config.placeholders.filter((p) => !p.hidden).flatMap((p) => bindingFields(p.binding)))];
        const fn = t.config.output.filename_field;
        if (fn) {
          if (fn.includes("{{")) required.push(...extractTokens(fn));
          else filenameField = fn;
        }
      }
      return unwrap(api.POST("/api/v1/datasets/{dataset_id}/validate", { params: { path: { dataset_id: datasetId! } }, body: { required_fields: [...new Set(required)], filename_field: filenameField } }));
    },
    onSuccess: setValidation,
    onError: (e: Error) => toast.error(e.message),
  });

  const fields = page?.fields ?? dataset?.fields ?? [];
  const columns = useMemo<ColumnDef<Record_>[]>(
    () => [
      { id: "__row", header: "#", cell: (c) => <span className="text-muted-foreground">{offset + c.row.index + 1}</span> },
      ...fields.map((f) => ({ id: f, header: f, accessorFn: (r: Record_) => r[f] ?? "" })),
    ],
    [fields, offset],
  );
  const table = useReactTable({ data: page?.records ?? [], columns, getCoreRowModel: getCoreRowModel() });

  const emptyCells = useMemo(() => {
    const m = new Set<string>();
    if (validation) for (const [f, info] of Object.entries(validation.empty)) for (const r of info.rows) m.add(`${r}:${f}`);
    return m;
  }, [validation]);

  const total = page?.total ?? dataset?.row_count ?? 0;
  const busy = upload.isPending;

  return (
    <PageContainer
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) upload.mutate({ file: f });
      }}
    >
      <PageHeader
        title="Data"
        crumbs={[{ label: "Data" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setPaste(paste == null ? "" : null)}>
              <ClipboardPaste /> Paste JSON
            </Button>
            <Button onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} {dataset ? "Load another file" : "Load file"}
            </Button>
          </>
        }
      />
      <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload.mutate({ file: f });
            e.target.value = "";
          }}
        />

      {paste != null && (
        <Card>
          <CardHeader>
            <CardTitle>
              <ClipboardPaste className="text-primary" /> Paste JSON
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              placeholder={'[\n  {"FirstName": "Anna", "LastName": "Müller"},\n  {"FirstName": "Jörg", "LastName": "Åström"}\n]'}
            />
            <div className="flex gap-2">
              <Button onClick={() => upload.mutate({ text: paste })} disabled={!paste.trim() || busy}>
                Load
              </Button>
              <Button variant="ghost" onClick={() => setPaste(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {datasetError && datasetId && (
        <p className="flex items-center gap-2 rounded-md bg-warning-soft px-4 py-3 text-sm font-semibold text-warning-text">
          <AlertTriangle className="h-4 w-4" /> The previously selected data is no longer available. Choose another dataset or load the file again.
        </p>
      )}

      {datasets && datasets.length > 0 && (
        <DatasetList
          datasets={datasets}
          activeId={dataset ? datasetId : null}
          templateNames={new Map((templates ?? []).map((t) => [t.id, t.name]))}
          onUse={(id) => {
            setDataset(id);
            setOffset(0);
            setValidation(null);
          }}
        />
      )}

      {!dataset && datasets && datasets.length > 0 ? null : !dataset ? (
        <Empty
          icon={<Database />}
          title="No data loaded"
          action={
            <Button onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Load file
            </Button>
          }
        >
          Load an Excel (.xlsx), CSV or JSON file — or drop it here. The first row (or the JSON keys) become the field names. Uploaded data is kept on the server until you delete it.
        </Empty>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-end gap-5">
              <div className="flex items-center gap-3">
                <IconAvatar icon={<FileSpreadsheet />} tone="success" size="lg" />
                <div>
                  <div className="text-base font-bold text-heading">{dataset.filename}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="secondary">{dataset.kind.toUpperCase()}</Badge>
                    <Badge>{dataset.row_count} rows</Badge>
                    <Badge variant="info">{dataset.fields.length} columns</Badge>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Uploaded {formatDate(new Date(dataset.created_at * 1000).toISOString())}</div>
                </div>
              </div>
              {dataset.sheets.length > 1 && (
                <Field label="Sheet">
                  <Select
                    value={dataset.sheet ?? ""}
                    onChange={(e) => {
                      if (lastFile) upload.mutate({ file: lastFile, sheet: e.target.value });
                      else toast.error("Please load the file again to switch sheets.");
                    }}
                    className="w-48"
                  >
                    {dataset.sheets.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <div className="ml-auto flex items-end gap-2">
                <Field label="Check against template">
                  <Select value={templateId} onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : "")} className="w-56">
                    <option value="">— only duplicates/empty —</option>
                    {templates?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button variant="outline" onClick={() => validate.mutate()} disabled={validate.isPending}>
                  {validate.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Validate
                </Button>
                <Button
                  variant="soft-destructive"
                  size="icon"
                  className="size-9"
                  title="Stop using this data (it stays in the list)"
                  aria-label="Stop using this data"
                  onClick={() => {
                    setDataset(null);
                    setValidation(null);
                  }}
                >
                  <X />
                </Button>
              </div>
            </CardContent>
          </Card>

          {validation && <ValidationReport v={validation} />}

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Records</CardTitle>
            </CardHeader>
            <div className="max-h-[65vh] overflow-auto">
            <Table>
              <THead>
                {table.getHeaderGroups().map((hg) => (
                  <TR key={hg.id}>
                    {hg.headers.map((h) => (
                      <TH key={h.id} className="whitespace-nowrap">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </TH>
                    ))}
                  </TR>
                ))}
              </THead>
              <TBody>
                {table.getRowModel().rows.map((row) => (
                  <TR key={row.id}>
                    {row.getVisibleCells().map((cell) => {
                      const flagged = emptyCells.has(`${offset + row.index}:${cell.column.id}`);
                      return (
                        <TD key={cell.id} className={flagged ? "bg-destructive-soft" : undefined}>
                          {flexRender(cell.column.columnDef.cell ?? ((c: { getValue: () => unknown }) => String(c.getValue() ?? "")), cell.getContext())}
                        </TD>
                      );
                    })}
                  </TR>
                ))}
              </TBody>
            </Table>
            </div>
          <CardFooter className="text-sm">
            <span className="text-muted-foreground">
              Rows {total ? offset + 1 : 0}–{Math.min(offset + pageSize, total)} of {total}
            </span>
            {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <div className="ml-auto flex items-center gap-2">
              <Select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setOffset(0);
                }}
                className="h-8 w-28"
                aria-label="Rows per page"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s} / page
                  </option>
                ))}
              </Select>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={offset === 0}>
                <ChevronLeft />
              </Button>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setOffset(offset + pageSize)} disabled={offset + pageSize >= total}>
                <ChevronRight />
              </Button>
            </div>
          </CardFooter>
          </Card>
        </>
      )}
    </PageContainer>
  );
}

function DatasetList({ datasets, activeId, templateNames, onUse }: { datasets: DatasetOut[]; activeId: string | null; templateNames: Map<number, string>; onUse: (id: string) => void }) {
  const qc = useQueryClient();
  const setDataset = useSession((s) => s.setDataset);
  const del = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/v1/datasets/{dataset_id}", { params: { path: { dataset_id: id } } })),
    onSuccess: (_, id) => {
      if (useSession.getState().datasetId === id) setDataset(null);
      qc.invalidateQueries({ queryKey: ["datasets"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success("Dataset deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>
          <Files className="text-primary" /> Uploaded data
        </CardTitle>
      </CardHeader>
      <div className="max-h-80 overflow-auto">
        <Table>
          <THead>
            <TR>
              <TH>File</TH>
              <TH>Rows</TH>
              <TH>Columns</TH>
              <TH>Uploaded</TH>
              <TH>Used by templates</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {datasets.map((d) => {
              const active = d.id === activeId;
              const used = d.template_ids ?? [];
              return (
                <TR key={d.id} className={active ? "bg-primary-soft/40" : undefined}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <IconAvatar size="sm" tone={d.kind === "json" ? "purple" : "success"} icon={d.kind === "json" ? <FileJson /> : <FileSpreadsheet />} />
                      <div className="min-w-0">
                        <div className="truncate font-bold text-heading">{d.filename}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {d.kind.toUpperCase()}
                          {d.sheet ? ` · ${d.sheet}` : ""}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>{d.row_count}</TD>
                  <TD>{d.fields.length}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{formatDate(new Date(d.created_at * 1000).toISOString())}</TD>
                  <TD>
                    {used.length ? (
                      <div className="flex flex-wrap gap-1">
                        {used.map((id) => (
                          <Link key={id} to={`/templates/${id}`}>
                            <Badge variant="info" className="hover:underline">
                              {templateNames.get(id) ?? `#${id}`}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {active ? (
                        <Badge variant="success" pill>
                          In use
                        </Badge>
                      ) : (
                        <Button size="sm" variant="soft" onClick={() => onUse(d.id)}>
                          Use
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive-text hover:bg-destructive-soft"
                        aria-label={`Delete ${d.filename}`}
                        title="Delete dataset"
                        disabled={del.isPending}
                        onClick={() => {
                          const msg = used.length
                            ? `Delete "${d.filename}"? It is linked to ${used.length} template${used.length > 1 ? "s" : ""}; they will no longer have data selected.`
                            : `Delete "${d.filename}"?`;
                          if (confirm(msg)) del.mutate(d.id);
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

function ValidationReport({ v }: { v: ValidateResponse }) {
  const empty = Object.entries(v.empty);
  const ok = !empty.length && !v.duplicates.length && !v.unmapped_fields.length;
  return (
    <Card className={ok ? "border-l-4 border-l-success" : "border-l-4 border-l-warning"}>
      <CardContent className="flex flex-col gap-2 text-sm">
        {ok ? (
          <p className="flex items-center gap-2 font-bold text-success-text">
            <CheckCircle2 className="h-4 w-4" /> All {v.row_count} rows look good.
          </p>
        ) : (
          <p className="flex items-center gap-2 font-bold text-warning-text">
            <AlertTriangle className="h-4 w-4" /> Validation found issues in {v.row_count} rows
          </p>
        )}
        {v.unmapped_fields.length > 0 && (
          <p>
            Fields used by the template but missing in the data:{" "}
            {v.unmapped_fields.map((f) => (
              <Badge key={f} variant="destructive" className="mr-1">
                {f}
              </Badge>
            ))}
          </p>
        )}
        {empty.map(([f, info]) => (
          <p key={f}>
            <Badge variant="warning" className="mr-1">
              {f}
            </Badge>
            empty in {info.count} row{info.count > 1 ? "s" : ""}: {rowsLabel(info.rows, info.count)}
          </p>
        ))}
        {v.duplicates.length > 0 && (
          <div>
            <p>Duplicate file names (a suffix like _2 will be added):</p>
            <ul className="ml-4 list-disc">
              {v.duplicates.slice(0, 20).map((d) => (
                <li key={d.value}>
                  “{d.value}” in rows {rowsLabel(d.rows, d.rows.length)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
