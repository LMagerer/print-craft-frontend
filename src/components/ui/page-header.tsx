import { ChevronRight } from "lucide-react";
import type * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  to?: string;
}

/** Page title row with breadcrumb and right-aligned actions (Paces "page-title-head"). */
export function PageHeader({ title, subtitle, crumbs, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
      <div className="mr-auto min-w-0">
        <h1 className="truncate text-lg font-bold leading-7 text-heading">{title}</h1>
        {crumbs && crumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-primary">
              PrintCraft
            </Link>
            {crumbs.map((c) => (
              <span key={c.label} className="flex items-center gap-1">
                <ChevronRight className="size-3" />
                {c.to ? (
                  <Link to={c.to} className="hover:text-primary">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-heading/80">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : (
          subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Standard scrollable page body with Paces spacing. */
export function PageContainer({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex w-full flex-col gap-4 p-4 lg:px-5", className)} {...p} />;
}
