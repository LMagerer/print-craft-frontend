import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-9 w-full rounded-md py-1 border border-input bg-card px-2.5 text-sm text-heading transition-colors placeholder:text-muted-foreground/80 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/15",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-16 w-full rounded-md py-2 border border-input bg-card px-2.5 text-sm text-heading transition-colors placeholder:text-muted-foreground/80 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/15 aria-[invalid=true]:border-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

/** Number input that commits parsed values and tolerates intermediate text ("1.", "-"). */
export function NumberInput({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  className,
  ...rest
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "step">) {
  const [text, setText] = React.useState(value == null ? "" : String(value));
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!focused.current) setText(value == null ? "" : String(value));
  }, [value]);
  const invalid = text !== "" && (Number.isNaN(Number(text)) || (min !== undefined && Number(text) < min) || (max !== undefined && Number(text) > max));
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={text}
      aria-invalid={invalid}
      className={className}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(value == null ? "" : String(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && !Number.isNaN(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
      }}
      {...rest}
    />
  );
}
