import * as Menu from "@radix-ui/react-dropdown-menu";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({ className, align = "end", ...p }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content align={align} sideOffset={4} className={cn("z-50 min-w-44 rounded-md border bg-popover p-1 text-sm shadow-pop", className)} {...p} />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, danger, ...p }: React.ComponentProps<typeof Menu.Item> & { danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded px-2.5 py-1.5 font-medium outline-none transition-colors [&_svg]:size-4 [&_svg]:text-muted-foreground",
        danger ? "text-destructive-text data-[highlighted]:bg-destructive-soft [&_svg]:text-destructive-text" : "text-heading data-[highlighted]:bg-muted",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      {...p}
    />
  );
}

export const DropdownMenuSeparator = ({ className, ...p }: React.ComponentProps<typeof Menu.Separator>) => <Menu.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...p} />;
