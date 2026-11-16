import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("rounded-lg border border-transparent bg-card text-card-foreground shadow-card", className)} {...p} />
);

/** Card header; put a CardTitle (and optional CardDescription) inside, `actions` render on the right. */
export const CardHeader = ({ className, actions, children, ...p }: React.HTMLAttributes<HTMLDivElement> & { actions?: React.ReactNode }) => (
  <div className={cn("flex items-center gap-3 border-b border-dashed px-5 py-3.5", className)} {...p}>
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("flex items-center gap-2 text-[0.95rem] font-bold leading-6 text-heading [&_svg]:size-4", className)} {...p} />
);
export const CardDescription = ({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-xs text-muted-foreground", className)} {...p} />
);
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("p-5", className)} {...p} />;
export const CardFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center gap-2 border-t border-dashed px-5 py-3", className)} {...p} />
);
