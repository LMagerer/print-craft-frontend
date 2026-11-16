import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_2px_6px_-1px] shadow-primary/40 hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-[0_2px_6px_-1px] shadow-destructive/40 hover:bg-destructive/90",
        success: "bg-success text-white shadow-[0_2px_6px_-1px] shadow-success/40 hover:bg-success/90",
        soft: "bg-primary-soft text-primary hover:bg-primary hover:text-primary-foreground",
        "soft-destructive": "bg-destructive-soft text-destructive-text hover:bg-destructive hover:text-destructive-foreground",
        outline: "border border-input bg-card text-heading hover:border-primary/40 hover:bg-primary-soft/50 hover:text-primary",
        secondary: "bg-muted text-heading hover:bg-muted/70",
        ghost: "text-foreground hover:bg-muted hover:text-heading",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-[0.95rem]",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
