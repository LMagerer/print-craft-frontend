import type * as React from "react";
import { cn } from "@/lib/utils";
import { softTone, type Tone } from "./tone";

const SIZES = { sm: "h-8 w-8 [&_svg]:size-4", md: "h-11 w-11 [&_svg]:size-5", lg: "h-14 w-14 [&_svg]:size-7" };

/** Icon on a tinted rounded square (or circle), as used for Paces stat widgets. */
export function IconAvatar({ icon, tone = "primary", size = "md", round, className }: { icon: React.ReactNode; tone?: Tone; size?: keyof typeof SIZES; round?: boolean; className?: string }) {
  return <span className={cn("inline-flex shrink-0 items-center justify-center", round ? "rounded-full" : "rounded-lg", SIZES[size], softTone[tone], className)}>{icon}</span>;
}
