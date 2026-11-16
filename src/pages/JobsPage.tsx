import { FileText, ListChecks, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useJobs, useTemplates } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { IconAvatar } from "@/components/ui/icon-avatar";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Segmented } from "@/components/ui/tabs";
import { JobPanel, StatusBadge, statusTone } from "@/features/jobs/JobPanel";
import { cn, formatDate } from "@/lib/utils";

export function JobsPage() {
  const params = useParams();
  const navigate = useNavigate();
  const selected = params.id ? Number(params.id) : null;
  const [kind, setKind] = useState<"" | "cards" | "pdf">("");
  const { data: jobs, isLoading, error } = useJobs(kind || undefined);
  const { data: templates } = useTemplates({ archived: "include" });
  const templateNames = useMemo(() => new Map((templates ?? []).map((t) => [t.id, t.name])), [templates]);

  return (
    <PageContainer>
      <PageHeader title="Jobs" crumbs={[{ label: "Jobs" }]} actions={<Segmented value={kind} onChange={setKind} options={[{ value: "", label: "All jobs" }, { value: "cards", label: "Cards" }, { value: "pdf", label: "PDFs" }]} />} />
      {error && <p className="text-destructive-text">{(error as Error).message}</p>}
      {selected != null && (
        <Card>
          <CardHeader actions={<Button size="sm" variant="ghost" onClick={() => navigate("/jobs")}>Close</Button>}>
            <CardTitle>Job details</CardTitle>
          </CardHeader>
          <CardContent>
            <JobPanel key={selected} jobId={selected} onDeleted={() => navigate("/jobs")} />
          </CardContent>
        </Card>
      )}
      {jobs && jobs.length === 0 ? (
        <Empty icon={<ListChecks />} title="No jobs yet" action={<Button asChild><Link to="/generate">Generate cards</Link></Button>}>
          Jobs appear here when you generate cards or create a print PDF.
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <div className="overflow-auto">
            {isLoading && <p className="p-5 text-muted-foreground">Loading…</p>}
            {jobs && jobs.length > 0 && (
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Job</TH>
                    <TH>Template</TH>
                    <TH>Data</TH>
                    <TH>Status</TH>
                    <TH className="w-56">Progress</TH>
                    <TH>Issues</TH>
                    <TH className="pr-5">Created</TH>
                  </TR>
                </THead>
                <TBody>
                  {jobs.map((j) => (
                    <TR key={j.id} onClick={() => navigate(`/jobs/${j.id}`)} className={cn("cursor-pointer", j.id === selected && "bg-primary-soft/50 hover:bg-primary-soft/60")}>
                      <TD className="pl-5">
                        <div className="flex items-center gap-3">
                          <IconAvatar size="sm" tone={j.kind === "pdf" ? "purple" : "primary"} icon={j.kind === "pdf" ? <Printer /> : <FileText />} />
                          <div>
                            <div className="font-bold text-heading">#{j.id}</div>
                            <div className="text-[11px] text-muted-foreground">{j.kind === "pdf" ? "Print PDF" : "Cards"}</div>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        {j.template_id != null ? (
                          <Link to={`/templates/${j.template_id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary hover:underline">
                            {templateNames.get(j.template_id) ?? `#${j.template_id}`}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TD>
                      <TD className="max-w-48 truncate">{j.data_filename}</TD>
                      <TD>
                        <StatusBadge status={j.status} />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress value={Math.round(j.progress * 100)} tone={statusTone(j.status)} className="flex-1" />
                          <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                            {j.processed}/{j.row_count}
                          </span>
                        </div>
                      </TD>
                      <TD className="text-xs">
                        {[j.error_count && `${j.error_count} errors`, j.skipped_count && `${j.skipped_count} skipped`, j.warning_count && `${j.warning_count} warnings`].filter(Boolean).join(" · ") || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap pr-5 text-xs text-muted-foreground">{formatDate(j.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
