import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List className={cn("inline-flex h-9 items-center gap-0.5 rounded-md bg-muted p-1 text-muted-foreground", className)} {...p} />
);
export const TabsTrigger = ({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded px-3 py-1 text-sm font-semibold transition-all hover:text-heading data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-card",
      className,
    )}
    {...p}
  />
);
export const TabsContent = ({ className, ...p }: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn("mt-3 focus-visible:outline-none", className)} {...p} />
);

/** Pill filter bar (Paces nav-pills) driven by plain state rather than tab panels. */
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn("inline-flex items-center gap-1 rounded-md bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded px-3 text-xs font-bold transition-all",
            o.value === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-heading",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
