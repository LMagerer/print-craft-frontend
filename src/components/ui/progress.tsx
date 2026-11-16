import { cn } from "@/lib/utils";
import { solidTone, type Tone } from "./tone";

export function Progress({ value, className, tone = "primary" }: { value: number; className?: string; tone?: Tone }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", solidTone[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}
