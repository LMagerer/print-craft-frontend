import { Database, Link2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useDatasets, useLinkDataset } from "@/api/hooks";
import type { DatasetOut } from "@/api/types";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSession } from "@/stores/sessionStore";

export function datasetLabel(d: DatasetOut) {
  const date = new Date(d.created_at * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${d.filename}${d.sheet ? ` · ${d.sheet}` : ""} · ${d.row_count} rows · ${date}`;
}

/**
 * Chooses the active dataset. With a `templateId`, the choice is also saved on the template,
 * so it is selected again the next time the template is opened.
 */
export function DatasetPicker({ templateId, linkedId, className, compact }: { templateId?: number | null; linkedId?: string | null; className?: string; compact?: boolean }) {
  const datasetId = useSession((s) => s.datasetId);
  const setDataset = useSession((s) => s.setDataset);
  const { data: datasets } = useDatasets();
  const link = useLinkDataset();
  const known = datasets?.some((d) => d.id === datasetId);
  const linked = templateId != null && !!linkedId && linkedId === datasetId;

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {!compact && <Database className="size-4 shrink-0 text-muted-foreground" />}
      <Select
        aria-label="Data source"
        value={known ? datasetId! : ""}
        className={cn("min-w-0", compact ? "h-8 w-56 text-xs" : "flex-1")}
        onChange={(e) => {
          const id = e.target.value || null;
          setDataset(id);
          if (templateId != null) link.mutate({ templateId, datasetId: id });
        }}
      >
        <option value="">{datasets?.length ? "No data" : "No data uploaded yet"}</option>
        {datasets?.map((d) => (
          <option key={d.id} value={d.id}>
            {datasetLabel(d)}
          </option>
        ))}
      </Select>
      {linked && (
        <span title="Saved with this template" className="shrink-0 text-success-text">
          <Link2 className="size-4" />
        </span>
      )}
      {!compact && (
        <Link to="/data" className="shrink-0 text-xs font-semibold text-primary hover:underline">
          Manage
        </Link>
      )}
    </div>
  );
}
