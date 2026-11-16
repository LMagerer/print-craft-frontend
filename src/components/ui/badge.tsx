import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold leading-4 [&_svg]:size-3", {
  variants: {
    variant: {
      default: "bg-primary-soft text-primary",
      secondary: "bg-muted text-muted-foreground",
      destructive: "bg-destructive-soft text-destructive-text",
      warning: "bg-warning-soft text-warning-text",
      success: "bg-success-soft text-success-text",
      info: "bg-info-soft text-info-text",
      purple: "bg-purple-soft text-purple",
      outline: "border bg-card text-foreground",
      solid: "bg-primary text-primary-foreground",
    },
    pill: { true: "rounded-full px-2.5" },
  },
  defaultVariants: { variant: "default" },
});

export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export function Badge({ className, variant, pill, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, pill }), className)} {...p} />;
}
