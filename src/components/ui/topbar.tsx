import type * as React from "react";
import { cn } from "@/lib/utils";

/** White application bar above the page content. */
export function Topbar({ start, end, className }: { start?: React.ReactNode; end?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("relative z-20 flex h-[60px] shrink-0 items-center gap-3 border-b bg-card px-4 shadow-[0_1px_4px_rgba(130,143,163,0.08)]", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">{start}</div>
      {end && <div className="flex min-w-0 items-center gap-2">{end}</div>}
    </header>
  );
}
