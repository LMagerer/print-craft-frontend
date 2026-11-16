import type { z } from "zod";
import type { components } from "./schema";
import { templateConfigSchema } from "./templateConfig.zod";

type S = components["schemas"];

/** Template config with all defaults filled in (output of the generated zod schema). */
export type TemplateConfig = z.output<typeof templateConfigSchema>;
export type Placeholder = TemplateConfig["placeholders"][number];
export type FontConfig = Placeholder["font"];
export type Binding = Placeholder["binding"];
export type SizeConfig = TemplateConfig["size"];
export type Record_ = Record<string, string>;

export type TemplateSummary = S["TemplateSummary"];
export type TemplateOut = Omit<S["TemplateOut"], "config"> & { config: TemplateConfig };
export type TemplateVersion = S["TemplateVersionOut"];
export type FontOut = S["FontOut"];
export type SystemFont = S["SystemFont"];
export type DatasetOut = S["DatasetOut"];
export type RecordsPage = S["RecordsPage"];
export type ValidateResponse = S["ValidateResponse"];
export type ImageInfo = S["ImageInfo"];
export type TransformRequest = S["TransformRequest"];
export type TransformResponse = S["TransformResponse"];
export type JobOut = S["JobOut"];
export type JobDetail = S["JobDetail"];
export type JobCreate = S["JobCreate"];
export type LayoutRequest = S["LayoutRequest"];
export type LayoutResponse = S["LayoutResponse"];
export type PdfJobCreate = S["PdfJobCreate"];
export type GlyphCheckResponse = S["GlyphCheckResponse"];

export interface RenderReport {
  id: string;
  text: string;
  size_pt: number;
  overflow: boolean;
  missing_glyphs: string[];
  missing_fields: string[];
}

export const parseConfig = (raw: unknown): TemplateConfig => templateConfigSchema.parse(raw ?? {});
