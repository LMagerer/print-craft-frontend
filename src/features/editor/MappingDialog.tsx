import { Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Binding, TemplateConfig } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { suggestBindings, validateTokens } from "@/lib/tokens";
import { useEditor } from "@/stores/editorStore";

/** Map every placeholder to a data column (or a {{token}} template) in one place. */
export function MappingDialog({ open, onOpenChange, config, fields }: { open: boolean; onOpenChange: (o: boolean) => void; config: TemplateConfig; fields: string[] }) {
  const apply = useEditor((s) => s.apply);
  const [draft, setDraft] = useState<Record<string, Binding>>({});

  useEffect(() => {
    if (open) setDraft(Object.fromEntries(config.placeholders.map((p) => [p.id, { ...p.binding }])));
  }, [open, config.placeholders]);

  const autoMatch = () => {
    setDraft((d) => {
      const next = { ...d };
      for (const p of config.placeholders) {
        const b = next[p.id];
        if (b.mode === "field" && b.field && fields.includes(b.field)) continue;
        const hit = suggestBindings([p.label], fields)[p.label] ?? suggestBindings([p.id], fields)[p.id];
        if (hit) next[p.id] = { mode: "field", field: hit, template: b.template };
      }
      return next;
    });
  };

  const save = () => {
    apply((c) => ({ ...c, placeholders: c.placeholders.map((p) => (draft[p.id] ? { ...p, binding: draft[p.id] } : p)) }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Field mapping</DialogTitle>
          <DialogDescription>
            {fields.length ? `Assign data columns (${fields.length} available) to placeholders.` : "Load a data file first to choose from its columns."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-auto rounded border">
          <Table>
            <THead>
              <TR>
                <TH>Placeholder</TH>
                <TH>Mode</TH>
                <TH className="w-1/2">Field / template</TH>
              </TR>
            </THead>
            <TBody>
              {config.placeholders.map((p) => {
                const b = draft[p.id] ?? p.binding;
                const set = (patch: Partial<Binding>) => setDraft((d) => ({ ...d, [p.id]: { ...b, ...patch } }));
                const bad = b.mode === "field" ? !!b.field && fields.length > 0 && !fields.includes(b.field) : fields.length > 0 && validateTokens(b.template ?? "", fields).length > 0;
                return (
                  <TR key={p.id}>
                    <TD className="font-medium">{p.label || p.id}</TD>
                    <TD>
                      <Select value={b.mode} onChange={(e) => set({ mode: e.target.value as Binding["mode"] })} className="w-28">
                        <option value="field">Field</option>
                        <option value="template">Template</option>
                      </Select>
                    </TD>
                    <TD className="max-w-none">
                      {b.mode === "field" ? (
                        <Select value={b.field ?? ""} onChange={(e) => set({ field: e.target.value || null })} aria-invalid={bad} className={bad ? "border-destructive" : ""}>
                          <option value="">— none —</option>
                          {b.field && !fields.includes(b.field) && <option value={b.field}>{b.field} (missing)</option>}
                          {fields.map((f) => (
                            <option key={f}>{f}</option>
                          ))}
                        </Select>
                      ) : (
                        <Input value={b.template ?? ""} onChange={(e) => set({ template: e.target.value })} aria-invalid={bad} className="font-mono text-xs" />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
        <DialogFooter>
          <Button variant="outline" className="mr-auto" onClick={autoMatch} disabled={!fields.length}>
            <Wand2 /> Auto-match by name
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
