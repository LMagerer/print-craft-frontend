/** Placeholder bindings. Mirrors backend/app/services/tokens.py. */
import type { Binding, Record_ } from "@/api/types";

export const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function extractTokens(template: string): string[] {
  const seen: string[] = [];
  for (const m of (template ?? "").matchAll(TOKEN_RE)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** Tokens that do not match any available field. */
export function validateTokens(template: string, fields: readonly string[]): string[] {
  const available = new Set(fields);
  return extractTokens(template).filter((t) => !available.has(t));
}

/** Unbalanced braces, which would otherwise be rendered literally. */
export function tokenSyntaxErrors(template: string): string[] {
  const errors: string[] = [];
  const stripped = (template ?? "").replace(TOKEN_RE, "");
  if (stripped.includes("{{")) errors.push("Unclosed {{ token");
  if (stripped.includes("}}")) errors.push("}} without matching {{");
  return errors;
}

export function renderTemplate(template: string, record: Record_): string {
  return (template ?? "").replace(TOKEN_RE, (_, name: string) => record[name] ?? "");
}

export function resolveBinding(binding: Binding, record: Record_ | null, sampleText = ""): string {
  if (record === null) {
    if (sampleText) return sampleText;
    if (binding.mode === "template") return binding.template ?? "";
    return binding.field ? `{{${binding.field}}}` : "";
  }
  if (binding.mode === "template") return renderTemplate(binding.template ?? "", record);
  if (!binding.field) return "";
  return record[binding.field] ?? "";
}

export function bindingFields(binding: Binding): string[] {
  if (binding.mode === "template") return extractTokens(binding.template ?? "");
  return binding.field ? [binding.field] : [];
}

const isSpace = (ch: string) => /\s/u.test(ch);

export function applyTransform(text: string, transform: string): string {
  if (transform === "uppercase") return text.toUpperCase();
  if (transform === "lowercase") return text.toLowerCase();
  if (transform === "capitalize") {
    let out = "";
    let prevSpace = true;
    for (const ch of Array.from(text)) {
      out += prevSpace ? ch.toUpperCase() : ch;
      prevSpace = isSpace(ch);
    }
    return out;
  }
  return text;
}

const norm = (s: string) => s.replace(/[\s_\-.]+/g, "").toLowerCase();

/** Suggest field bindings for placeholder labels/ids (case-insensitive, ignoring spaces, '_', '-', '.'). */
export function suggestBindings(labels: readonly string[], fields: readonly string[]): Record<string, string> {
  const byNorm = new Map(fields.map((f) => [norm(f), f]));
  const out: Record<string, string> = {};
  for (const label of labels) {
    const hit = byNorm.get(norm(label));
    if (hit) out[label] = hit;
  }
  return out;
}
