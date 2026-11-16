import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, CalendarClock, CheckCircle2, Copy, Database, Download, FileUp, ImagePlus, LayoutGrid, Loader2, MoreVertical, Pencil, Printer, Search, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, fileUrl, postForm, unwrap } from "@/api/client";
import { qk, useDataset, useJobs, useTemplates, type TemplateListParams } from "@/api/hooks";
import type { ImageInfo, TemplateSummary } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/tabs";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { useSession } from "@/stores/sessionStore";
import { round } from "@/lib/units";
import { downloadUrl, formatDate } from "@/lib/utils";

const ACCEPT_IMAGES = ".png,.jpg,.jpeg,.tif,.tiff,.webp,image/png,image/jpeg,image/tiff,image/webp";

function TemplateCard({ t }: { t: TemplateSummary }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const refresh = () => qc.invalidateQueries({ queryKey: qk.templates });

  const duplicate = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/templates/{template_id}/duplicate", { params: { path: { template_id: t.id } }, body: { name: `${t.name} (copy)` } })),
    onSuccess: () => {
      refresh();
      toast.success("Template duplicated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: (is_archived: boolean) => unwrap(api.PUT("/api/v1/templates/{template_id}", { params: { path: { template_id: t.id } }, body: { is_archived } })),
    onSuccess: (_, a) => {
      refresh();
      toast.success(a ? "Archived" : "Restored from archive");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/templates/{template_id}", { params: { path: { template_id: t.id } } })),
    onSuccess: () => {
      refresh();
      toast.success("Template deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = duplicate.isPending || archive.isPending || remove.isPending;
  return (
    <Card className="group relative flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <Link to={`/templates/${t.id}`} className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-[#f1f3f8] p-4">
        <img src={fileUrl.thumbnail(t.image_sha256, 480)} alt={t.name} className="max-h-full max-w-full rounded object-contain shadow-[0_4px_14px_rgba(30,31,39,0.18)] transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
        <span className="absolute inset-0 flex items-center justify-center bg-sidebar/0 opacity-0 transition-all group-hover:bg-sidebar/35 group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-heading shadow-pop">
            <Pencil className="size-3.5" /> Open editor
          </span>
        </span>
        {t.is_archived && (
          <Badge variant="secondary" className="absolute left-3 top-3 bg-white/90">
            <Archive /> Archived
          </Badge>
        )}
      </Link>
      <div className="flex items-start gap-2 border-t border-dashed px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link to={`/templates/${t.id}`} className="block truncate font-bold text-heading hover:text-primary" title={t.name}>
            {t.name}
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Badge>
              {round(t.width_mm, 1)} × {round(t.height_mm, 1)} mm
            </Badge>
            <Badge variant={t.dpi > 1200 ? "warning" : "info"} title={t.dpi > 1200 ? "Very high resolution: consider resampling to 300 DPI in the Size dialog" : undefined}>
              {Math.round(t.dpi)} DPI
            </Badge>
            <Badge variant="purple">v{t.version}</Badge>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarClock className="size-3" /> Updated {formatDate(t.updated_at)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="-mr-2 text-muted-foreground" aria-label="Actions">
              {busy ? <Loader2 className="animate-spin" /> : <MoreVertical />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem asChild>
              <Link to={`/templates/${t.id}`}>
                <Pencil /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => duplicate.mutate()}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => downloadUrl(fileUrl.templateExport(t.id))}>
              <Download /> Export .zip
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => archive.mutate(!t.is_archived)}>
              {t.is_archived ? <ArchiveRestore /> : <Archive />} {t.is_archived ? "Unarchive" : "Archive"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              danger
              onSelect={async () => {
                if (await confirm({ title: `Delete “${t.name}”?`, description: "The template and all its versions are deleted permanently. Generated jobs remain.", confirmLabel: "Delete", destructive: true }))
                  remove.mutate();
              }}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}

function NewTemplateTile({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-input bg-card/60 p-6 text-center transition-colors hover:border-primary/60 hover:bg-primary-soft/40"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">{busy ? <Loader2 className="size-6 animate-spin" /> : <UploadCloud className="size-6" />}</span>
      <span className="font-bold text-heading">New template</span>
      <span className="max-w-48 text-xs text-muted-foreground">Upload or drop a card background (PNG, JPEG, TIFF, WebP)</span>
    </button>
  );
}

export function LibraryPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useState<TemplateListParams>({ sort: "updated_at", order: "desc", archived: "exclude" });
  const [search, setSearch] = useState("");
  const { data: templates, isLoading, error } = useTemplates({ ...params, search: search.trim() || undefined });
  const imageInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { data: allTemplates } = useTemplates({ sort: "updated_at", order: "desc", archived: "exclude" });
  const { data: jobs } = useJobs();
  const datasetId = useSession((s) => s.datasetId);
  const { data: dataset } = useDataset(datasetId);
  const cardJobs = jobs?.filter((j) => j.kind === "cards" && j.status.startsWith("completed")) ?? [];
  const pdfJobs = jobs?.filter((j) => j.kind === "pdf" && j.status.startsWith("completed")) ?? [];
  const cardsMade = cardJobs.reduce((n, j) => n + j.processed - j.error_count - j.skipped_count, 0);

  const create = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const info = await postForm<ImageInfo>("/images", form);
      const name = file.name.replace(/\.[^.]+$/, "") || "New template";
      return unwrap(api.POST("/api/v1/templates", { body: { name, description: "", image_ref: info.ref } }));
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: qk.templates });
      navigate(`/templates/${t.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const importZip = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return postForm<{ id: number; name: string }>("/templates/import", form);
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: qk.templates });
      toast.success(`Imported “${t.name}”`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.name.toLowerCase().endsWith(".zip")) importZip.mutate(f);
    else create.mutate(f);
  };

  return (
    <PageContainer
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <PageHeader
        title="Templates"
        crumbs={[{ label: "Templates" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => zipInput.current?.click()} disabled={importZip.isPending}>
              {importZip.isPending ? <Loader2 className="animate-spin" /> : <FileUp />} Import .zip
            </Button>
            <Button onClick={() => imageInput.current?.click()} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />} New template
            </Button>
          </>
        }
      />
      <input
        ref={imageInput}
        type="file"
        accept={ACCEPT_IMAGES}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) create.mutate(f);
          e.target.value = "";
        }}
      />
      <input
        ref={zipInput}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importZip.mutate(f);
          e.target.value = "";
        }}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Templates" value={allTemplates?.length ?? "–"} icon={<LayoutGrid />} hint="Active card designs" />
        <StatCard
          label="Loaded data"
          value={dataset ? dataset.row_count.toLocaleString() : "–"}
          icon={<Database />}
          tone="info"
          hint={dataset ? `rows in ${dataset.filename}` : "Load a spreadsheet to start"}
          to="/data"
        />
        <StatCard label="Cards generated" value={cardsMade.toLocaleString()} icon={<CheckCircle2 />} tone="success" hint={`in ${cardJobs.length} completed job${cardJobs.length === 1 ? "" : "s"}`} to="/jobs" />
        <StatCard label="Print PDFs" value={pdfJobs.length} icon={<Printer />} tone="purple" hint="Ready to download" to="/pdf" />
      </div>

      <Card className="flex flex-wrap items-center gap-3 px-5 py-3.5">
        <div className="relative mr-auto w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="rounded-full bg-background pl-9" />
        </div>
        <Segmented
          value={params.archived ?? "exclude"}
          onChange={(v) => setParams((p) => ({ ...p, archived: v }))}
          options={[
            { value: "exclude", label: "Active" },
            { value: "only", label: "Archived" },
            { value: "include", label: "All" },
          ]}
        />
        <Select
          value={`${params.sort}:${params.order}`}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(":") as [TemplateListParams["sort"], TemplateListParams["order"]];
            setParams((p) => ({ ...p, sort, order }));
          }}
          className="w-44"
          aria-label="Sort"
        >
          <option value="updated_at:desc">Recently updated</option>
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="name:asc">Name A–Z</option>
          <option value="name:desc">Name Z–A</option>
        </Select>
      </Card>

      {error && <p className="text-destructive-text">Could not load templates: {(error as Error).message}</p>}
      {isLoading && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading templates…
        </p>
      )}
      {templates && templates.length === 0 && search ? (
        <Empty icon={<Search />} title="No templates match your search">
          Try a different name or clear the search.
        </Empty>
      ) : templates && templates.length === 0 && params.archived === "only" ? (
        <Empty icon={<Archive />} title="No archived templates" />
      ) : (
        templates && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-5">
            {params.archived !== "only" && <NewTemplateTile onClick={() => imageInput.current?.click()} busy={create.isPending} />}
            {templates.map((t) => (
              <TemplateCard key={t.id} t={t} />
            ))}
          </div>
        )
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary bg-card px-10 py-8 shadow-pop">
            <UploadCloud className="size-10 text-primary" />
            <p className="font-bold text-heading">Drop an image to create a template</p>
            <p className="text-xs text-muted-foreground">or a .zip to import one</p>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
