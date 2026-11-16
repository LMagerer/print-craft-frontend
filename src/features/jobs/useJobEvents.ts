import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fileUrl } from "@/api/client";
import { isActiveJob, qk } from "@/api/hooks";
import type { JobDetail, JobOut } from "@/api/types";

/** Subscribe to the job's SSE stream while it is active and merge updates into the query cache. */
export function useJobEvents(job: Pick<JobOut, "id" | "status"> | undefined) {
  const qc = useQueryClient();
  const id = job?.id;
  const active = !!job && isActiveJob(job.status);
  useEffect(() => {
    if (id == null || !active) return;
    const es = new EventSource(fileUrl.jobEvents(id));
    const onUpdate = (e: MessageEvent<string>) => {
      const data = JSON.parse(e.data) as JobOut;
      qc.setQueryData<JobDetail>(qk.job(id), (old) => (old ? { ...old, ...data } : old));
    };
    es.addEventListener("progress", onUpdate as EventListener);
    es.addEventListener("done", ((e: MessageEvent<string>) => {
      onUpdate(e);
      es.close();
      // Errors, outputs and lists only change in bulk; refetch them once at the end.
      qc.invalidateQueries({ queryKey: qk.job(id) });
      qc.invalidateQueries({ queryKey: qk.jobImages(id) });
      qc.invalidateQueries({ queryKey: qk.jobs });
    }) as EventListener);
    es.addEventListener("error", () => {
      // Fall back to a refetch; EventSource reconnects on its own if the server is still there.
      qc.invalidateQueries({ queryKey: qk.job(id) });
    });
    return () => es.close();
  }, [id, active, qc]);
}
