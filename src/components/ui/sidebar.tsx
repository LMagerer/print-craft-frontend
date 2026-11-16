import type * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Tip } from "./tooltip";

/** Dark Paces side navigation; `condensed` shows icons only. */
export function Sidebar({ condensed, brand, children, footer }: { condensed: boolean; brand: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <aside
      data-condensed={condensed || undefined}
      className={cn("group/sidebar flex h-full shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200", condensed ? "w-[70px]" : "w-60")}
    >
      <div className={cn("flex h-[60px] shrink-0 items-center", condensed ? "justify-center" : "px-5")}>{brand}</div>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2">{children}</nav>
      {footer && <div className="shrink-0 border-t border-white/5 p-3">{footer}</div>}
    </aside>
  );
}

export function SidebarSection({ title, condensed }: { title: string; condensed: boolean }) {
  return condensed ? (
    <div className="mx-auto my-2 h-px w-6 bg-white/10" />
  ) : (
    <div className="px-5 pb-1.5 pt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/60">{title}</div>
  );
}

export function SidebarItem({ to, end, icon, label, badge, condensed }: { to: string; end?: boolean; icon: React.ReactNode; label: string; badge?: React.ReactNode; condensed: boolean }) {
  const link = (
    <NavLink
      to={to}
      end={end}
      aria-label={condensed ? label : undefined}
      className={({ isActive }) =>
        cn(
          "relative mx-3 flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.9rem] font-semibold transition-colors [&_svg]:size-[18px] [&_svg]:shrink-0",
          condensed && "justify-center px-0",
          isActive ? "bg-white/[0.06] text-sidebar-active before:absolute before:-left-3 before:top-1.5 before:h-[calc(100%-12px)] before:w-[3px] before:rounded-r before:bg-primary [&_svg]:text-primary" : "hover:bg-sidebar-hover/60 hover:text-[#bccee4]",
        )
      }
    >
      {icon}
      {!condensed && <span className="flex-1 truncate">{label}</span>}
      {badge != null && (condensed ? <span className="absolute right-2 top-1.5 size-2 rounded-full bg-success" /> : badge)}
    </NavLink>
  );
  return condensed ? <Tip content={label}>{link}</Tip> : link;
}
