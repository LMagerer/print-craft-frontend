import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { api, unwrap } from "./client";
import { parseConfig, type TemplateOut } from "./types";
import { FontLibrary } from "@/lib/fonts";
import { useSession } from "@/stores/sessionStore";

export const qk = {
  templates: ["templates"] as const,
  template: (id: number) => ["templates", id] as const,
  versions: (id: number) => ["templates", id, "versions"] as const,
  fonts: ["fonts"] as const,
  systemFonts: ["fonts", "system"] as const,
  datasets: ["datasets", "list"] as const,
  dataset: (id: string) => ["datasets", id] as const,
  records: (id: string, offset: number, limit: number) => ["datasets", id, "records", offset, limit] as const,
  jobs: ["jobs"] as const,
  job: (id: number) => ["jobs", id] as const,
  jobImages: (id: number) => ["jobs", id, "images"] as const,
};

export interface TemplateListParams {
  search?: string;
  sort?: "name" | "created_at" | "updated_at";
  order?: "asc" | "desc";
  archived?: "exclude" | "include" | "only";
}

export function useTemplates(params: TemplateListParams) {
  return useQuery({
    queryKey: [...qk.templates, params],
    queryFn: () => unwrap(api.GET("/api/v1/templates", { params: { query: params } })),
    placeholderData: keepPreviousData,
  });
}

export async function fetchTemplate(id: number): Promise<TemplateOut> {
  const t = await unwrap(api.GET("/api/v1/templates/{template_id}", { params: { path: { template_id: id } } }));
  return { ...t, config: parseConfig(t.config) };
}

export function useTemplate(id: number | null) {
  return useQuery({
    queryKey: qk.template(id ?? -1),
    queryFn: () => fetchTemplate(id!),
    enabled: id != null,
  });
}

export function useTemplateVersions(id: number) {
  return useQuery({
    queryKey: qk.versions(id),
    queryFn: () => unwrap(api.GET("/api/v1/templates/{template_id}/versions", { params: { path: { template_id: id } } })),
  });
}

export function useFonts() {
  return useQuery({
    queryKey: qk.fonts,
    queryFn: async () => {
      const fonts = await unwrap(api.GET("/api/v1/fonts"));
      return { fonts, lib: new FontLibrary(fonts) };
    },
    staleTime: 60_000,
  });
}

export function useSystemFonts(enabled: boolean) {
  return useQuery({ queryKey: qk.systemFonts, queryFn: () => unwrap(api.GET("/api/v1/fonts/system")), enabled, staleTime: Infinity });
}

export function useDatasets() {
  return useQuery({ queryKey: qk.datasets, queryFn: () => unwrap(api.GET("/api/v1/datasets")) });
}

/** Save which dataset a template uses (no new template version). */
export function useLinkDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, datasetId }: { templateId: number; datasetId: string | null }) =>
      unwrap(api.PUT("/api/v1/templates/{template_id}", { params: { path: { template_id: templateId } }, body: { dataset_id: datasetId } })),
    onSuccess: (t) => {
      qc.setQueryData<TemplateOut>(qk.template(t.id), (old) => (old ? { ...old, dataset_id: t.dataset_id } : old));
      qc.invalidateQueries({ queryKey: qk.templates });
      qc.invalidateQueries({ queryKey: qk.datasets });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** When a template with a saved dataset is opened, make that dataset the active one (once per template). */
export function useApplyTemplateDataset(template: { id: number; dataset_id?: string | null } | null | undefined) {
  const applied = useRef<number | null>(null);
  useEffect(() => {
    if (!template || applied.current === template.id) return;
    applied.current = template.id;
    const { datasetId, setDataset } = useSession.getState();
    if (template.dataset_id && template.dataset_id !== datasetId) setDataset(template.dataset_id);
  }, [template]);
}

export function useDataset(id: string | null) {
  return useQuery({
    queryKey: qk.dataset(id ?? ""),
    queryFn: () => unwrap(api.GET("/api/v1/datasets/{dataset_id}", { params: { path: { dataset_id: id! } } })),
    enabled: !!id,
    retry: false,
  });
}

export function useRecords(id: string | null, offset: number, limit: number) {
  return useQuery({
    queryKey: qk.records(id ?? "", offset, limit),
    queryFn: () =>
      unwrap(api.GET("/api/v1/datasets/{dataset_id}/records", { params: { path: { dataset_id: id! }, query: { offset, limit } } })),
    enabled: !!id,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

const ACTIVE = new Set(["queued", "running", "cancelling"]);
export const isActiveJob = (status: string) => ACTIVE.has(status);

export function useJobs(kind?: "cards" | "pdf") {
  return useQuery({
    queryKey: [...qk.jobs, kind ?? "all"],
    queryFn: () => unwrap(api.GET("/api/v1/jobs", { params: { query: kind ? { kind } : {} } })),
    refetchInterval: (q) => (q.state.data?.some((j) => isActiveJob(j.status)) ? 2000 : false),
  });
}

export function useJob(id: number | null) {
  return useQuery({
    queryKey: qk.job(id ?? -1),
    queryFn: () => unwrap(api.GET("/api/v1/jobs/{job_id}", { params: { path: { job_id: id! } } })),
    enabled: id != null,
  });
}

export function useJobImages(id: number | null, enabled = true) {
  return useQuery({
    queryKey: qk.jobImages(id ?? -1),
    queryFn: () => unwrap(api.GET("/api/v1/jobs/{job_id}/images", { params: { path: { job_id: id! } } })),
    enabled: id != null && enabled,
  });
}
