import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        heading: "hsl(var(--heading))",
        popover: "hsl(var(--popover))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))", soft: "hsl(var(--primary-soft))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))", soft: "hsl(var(--destructive-soft))", text: "hsl(var(--destructive-text))" },
        success: { DEFAULT: "hsl(var(--success))", soft: "hsl(var(--success-soft))", text: "hsl(var(--success-text))" },
        warning: { DEFAULT: "hsl(var(--warning))", soft: "hsl(var(--warning-soft))", text: "hsl(var(--warning-text))" },
        info: { DEFAULT: "hsl(var(--info))", soft: "hsl(var(--info-soft))", text: "hsl(var(--info-text))" },
        purple: { DEFAULT: "hsl(var(--purple))", soft: "hsl(var(--purple-soft))" },
        sidebar: { DEFAULT: "hsl(var(--sidebar))", foreground: "hsl(var(--sidebar-foreground))", hover: "hsl(var(--sidebar-hover))", active: "hsl(var(--sidebar-active))" },
      },
      boxShadow: {
        card: "0 1px 4px 0 rgba(130, 143, 163, 0.15)",
        "card-hover": "0 6px 18px -4px rgba(57, 62, 80, 0.18)",
        pop: "0 4px 16px rgba(57, 62, 80, 0.14)",
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [],
} satisfies Config;
