import type * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { IconAvatar } from "./icon-avatar";
import type { Tone } from "./tone";

/** KPI widget: uppercase label, large value, tinted icon and an optional footnote. */
export function StatCard({ label, value, icon, tone = "primary", hint, to, className }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: Tone; hint?: React.ReactNode; to?: string; className?: string }) {
  const body = (
    <Card className={cn("flex h-full items-start gap-4 p-5 transition-shadow", to && "hover:shadow-card-hover", className)}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 truncate text-2xl font-bold text-heading">{value}</p>
        {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      <IconAvatar icon={icon} tone={tone} round />
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25">
      {body}
    </Link>
  ) : (
    body
  );
}
