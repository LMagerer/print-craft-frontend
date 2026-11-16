import * as React from "react";
import { cn } from "@/lib/utils";

/** Native select styled like the inputs (accessible, keyboard friendly, no portal). */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-9 w-full cursor-pointer rounded-md border border-input bg-card px-2.5 text-sm text-heading transition-colors placeholder:text-muted-foreground/80 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:cursor-default disabled:bg-muted disabled:opacity-60",
      className,
    )}
    {...p}
  />
));
Select.displayName = "Select";
