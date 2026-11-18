import createClient from "openapi-fetch";
import type { paths } from "./schema";

export const API_BASE = "/api/v1";

/** Typed client generated from the backend's OpenAPI schema (`npm run gen:api`). */
export const api = createClient<paths>({ baseUrl: "" });

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Human-readable message from a FastAPI error body. */
export function errorMessage(body: unknown, fallback = "Request failed"): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => `${(d.loc ?? []).slice(1).join(".")}: ${d.msg}`)
      .join("; ");
  return fallback;
}

/** Unwrap an openapi-fetch result, throwing an ApiError on failure. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || !response.ok) throw new ApiError(errorMessage(error, response.statusText), response.status);
  return data as T;
}

/** Raw fetch for endpoints returning binary data or multipart uploads. */
export async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(API_BASE + path, init);
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    throw new ApiError(errorMessage(body, res.statusText), res.status);
  }
  return res;
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await rawFetch(path, { method: "POST", body: form });
  return (await res.json()) as T;
}

export const fileUrl = {
  image: (ref: string) => `${API_BASE}/images/${ref}`,
  thumbnail: (ref: string, size = 320) => `${API_BASE}/images/${ref}/thumbnail?size=${size}`,
  display: (ref: string) => `${API_BASE}/images/${ref}/display`,
  templateThumbnail: (id: number, version: number | string, size = 480) => `${API_BASE}/templates/${id}/thumbnail?size=${size}&v=${encodeURIComponent(String(version))}`,
  font: (id: number) => `${API_BASE}/fonts/${id}/file`,
  templateExport: (id: number) => `${API_BASE}/templates/${id}/export`,
  jobDownload: (id: number) => `${API_BASE}/jobs/${id}/download`,
  jobImage: (id: number, filename: string) => `${API_BASE}/jobs/${id}/images/${encodeURIComponent(filename)}`,
  jobEvents: (id: number) => `${API_BASE}/jobs/${id}/events`,
};
