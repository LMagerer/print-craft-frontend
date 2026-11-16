import type * as React from "react";
import { cn } from "@/lib/utils";
import { IconAvatar } from "./icon-avatar";

export function Empty({ icon, title, children, action, className }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-input bg-card px-6 py-14 text-center", className)}>
      {icon && <IconAvatar icon={icon} size="lg" round />}
      <div className="flex max-w-md flex-col gap-1">
        <p className="text-base font-bold text-heading">{title}</p>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </div>
      {action}
    </div>
  );
}
