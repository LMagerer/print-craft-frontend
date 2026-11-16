import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, fileUrl, unwrap } from "@/api/client";
import { qk, useTemplateVersions } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

export function VersionsDialog({ open, onOpenChange, templateId, current, onRestored }: { open: boolean; onOpenChange: (o: boolean) => void; templateId: number; current: number; onRestored: () => void }) {
  const { data: versions = [], isLoading } = useTemplateVersions(templateId);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const restore = useMutation({
    mutationFn: (version: number) => unwrap(api.POST("/api/v1/templates/{template_id}/restore/{version}", { params: { path: { template_id: templateId, version } } })),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: qk.templates });
      toast.success(`Restored as version ${t.version}`);
      onRestored();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>Every save creates a version. Restoring creates a new version with the old content.</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        <ul className="flex max-h-[60vh] flex-col divide-y overflow-auto rounded border">
          {[...versions].sort((a, b) => b.version - a.version).map((v) => (
            <li key={v.id} className="flex items-center gap-3 p-2">
              <img src={fileUrl.thumbnail(v.image_ref, 160)} alt="" className="h-12 w-20 rounded border object-contain" />
              <div className="flex-1 text-sm">
                <div className="font-medium">Version {v.version}{v.version === current && " (current)"}</div>
                <div className="text-xs text-muted-foreground">{formatDate(v.created_at)}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={v.version === current || restore.isPending}
                onClick={async () => {
                  if (await confirm({ title: `Restore version ${v.version}?`, description: "Unsaved changes in the editor will be discarded.", confirmLabel: "Restore" })) restore.mutate(v.version);
                }}
              >
                Restore
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
