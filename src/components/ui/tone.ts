/** Paces-style "soft" colour pairs: tinted background + emphasis text. */
export type Tone = "primary" | "success" | "warning" | "danger" | "info" | "purple" | "secondary";

export const softTone: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-destructive-soft text-destructive-text",
  info: "bg-info-soft text-info-text",
  purple: "bg-purple-soft text-purple",
  secondary: "bg-muted text-muted-foreground",
};

export const solidTone: Record<Tone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  purple: "bg-purple",
  secondary: "bg-muted-foreground",
};
