import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Download, FileText, Loader2, Printer, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, fileUrl, unwrap } from "@/api/client";
import { isActiveJob, qk, useJob, useJobImages } from "@/api/hooks";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { IconAvatar } from "@/components/ui/icon-avatar";
import { Progress } from "@/components/ui/progress";
import type { Tone } from "@/components/ui/tone";
import { downloadUrl, formatDate } from "@/lib/utils";
import { useJobEvents } from "./useJobEvents";

const STATUS: Record<string, { label: string; variant: BadgeVariant; tone: Tone }> = {
  queued: { label: "Queued", variant: "secondary", tone: "secondary" },
  running: { label: "Running", variant: "default", tone: "primary" },
  cancelling: { label: "Cancelling", variant: "warning", tone: "warning" },
  cancelled: { label: "Cancelled", variant: "secondary", tone: "secondary" },
  completed: { label: "Completed", variant: "success", tone: "success" },
  completed_with_errors: { label: "Completed with errors", variant: "warning", tone: "warning" },
  failed: { label: "Failed", variant: "destructive", tone: "danger" },
};

export const statusTone = (status: string): Tone => STATUS[status]?.tone ?? "secondary";

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, variant: "secondary" as const };
  return (
    <Badge variant={s.variant} pill>
      <span className={`size-1.5 rounded-full bg-current ${status === "running" ? "animate-pulse" : ""}`} />
      {s.label}
    </Badge>
  );
}

export function JobPanel({ jobId, onDeleted, showGallery = true }: { jobId: number; onDeleted?: () => void; showGallery?: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: job, error } = useJob(jobId);
  useJobEvents(job);
  const finished = !!job && !isActiveJob(job.status);
  const { data: images } = useJobImages(job?.kind === "cards" && finished && job.has_output ? jobId : null);
  const [showAll, setShowAll] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.job(jobId) });
    qc.invalidateQueries({ queryKey: qk.jobs });
  };
  const cancel = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/jobs/{job_id}/cancel", { params: { path: { job_id: jobId } } })),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const retry = useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/jobs/{job_id}/retry", { params: { path: { job_id: jobId } } })),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => unwrap(api.DELETE("/api/v1/jobs/{job_id}", { params: { path: { job_id: jobId } } })),
    onSuccess: () => {
      qc.removeQueries({ queryKey: qk.job(jobId) });
      qc.invalidateQueries({ queryKey: qk.jobs });
      toast.success("Job deleted");
      onDeleted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <p className="text-sm text-destructive-text">{(error as Error).message}</p>;
  if (!job) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;

  const pct = Math.round(job.progress * 100);
  const errors = job.errors.filter((e) => !e.warning && !e.skipped);
  const warnings = job.errors.filter((e) => e.warning);
  const skipped = job.errors.filter((e) => e.skipped);
  const issues = [...errors, ...skipped, ...warnings];
  const listed = showAll ? issues : issues.slice(0, 15);
  const isPdf = job.kind === "pdf";
  const params = job.params as Record<string, unknown>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <IconAvatar tone={isPdf ? "purple" : "primary"} icon={isPdf ? <Printer /> : <FileText />} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-heading">
              {isPdf ? "Print PDF" : "Cards"} #{job.id} · {String(params.template_name ?? "")}
            </span>
            <StatusBadge status={job.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {job.data_filename} · started {formatDate(job.created_at)}
            {job.finished_at ? ` · finished ${formatDate(job.finished_at)}` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={pct} tone={statusTone(job.status)} className="h-2 flex-1" />
        <span className="w-36 text-right text-sm font-semibold tabular-nums text-heading">
          {job.processed} / {job.row_count} <span className="font-normal text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {job.error_count > 0 && <Badge variant="destructive">{job.error_count} errors</Badge>}
        {job.skipped_count > 0 && <Badge variant="secondary">{job.skipped_count} skipped</Badge>}
        {job.warning_count > 0 && <Badge variant="warning">{job.warning_count} warnings</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {isActiveJob(job.status) && (
          <Button size="sm" variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending || job.status === "cancelling"}>
            <Ban /> Cancel
          </Button>
        )}
        {job.has_output && finished && (
          <Button size="sm" onClick={() => downloadUrl(fileUrl.jobDownload(job.id))}>
            <Download /> {isPdf ? "Download PDF" : "Download ZIP"}
          </Button>
        )}
        {!isPdf && job.has_output && finished && (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/pdf?job=${job.id}`}>
              <Printer /> Make print PDF
            </Link>
          </Button>
        )}
        {finished && job.status !== "completed" && (
          <Button size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
            <RotateCcw /> Retry
          </Button>
        )}
        {finished && (
          <Button
            size="sm"
            variant="soft-destructive"
            onClick={async () => {
              if (await confirm({ title: `Delete job #${job.id}?`, description: "Its output files are removed.", confirmLabel: "Delete", destructive: true })) remove.mutate();
            }}
          >
            <Trash2 /> Delete
          </Button>
        )}
      </div>

      {issues.length > 0 && (
        <div className="overflow-hidden rounded-md border">
          <div className="border-b bg-[#f9fafc] px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Problems</div>
          <ul className="max-h-64 divide-y divide-dashed overflow-auto text-sm">
            {listed.map((e, i) => (
              <li key={i} className="flex gap-3 px-3 py-2">
                <span className="w-16 shrink-0 text-muted-foreground">{e.row >= 0 ? `Row ${e.row + 1}` : "Job"}</span>
                <span className={e.warning ? "text-warning-text" : e.skipped ? "text-muted-foreground" : "text-destructive-text"}>
                  {e.skipped ? "Skipped: " : e.warning ? "Warning: " : ""}
                  {e.message}
                </span>
              </li>
            ))}
          </ul>
          {issues.length > listed.length && (
            <button className="w-full border-t py-1 text-xs text-primary hover:underline" onClick={() => setShowAll(true)}>
              Show all {issues.length}
            </button>
          )}
        </div>
      )}

      {showGallery && images && images.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {images.slice(0, 60).map((im) => (
            <a key={im.filename} href={fileUrl.jobImage(job.id, im.filename)} target="_blank" rel="noreferrer" className="group flex flex-col gap-1.5 rounded-md border bg-card p-1.5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover">
              <img src={fileUrl.jobImage(job.id, im.filename)} alt={im.filename} loading="lazy" className="aspect-[3/2] w-full rounded bg-[#f1f3f8] object-contain" />
              <span className="truncate px-0.5 text-[11px] font-semibold text-muted-foreground group-hover:text-primary" title={im.filename}>
                {im.row + 1}. {im.filename}
              </span>
            </a>
          ))}
          {images.length > 60 && <p className="col-span-full text-xs text-muted-foreground">… and {images.length - 60} more in the ZIP.</p>}
        </div>
      )}
    </div>
  );
}

