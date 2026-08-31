import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        // Tone lives on the hairline and tint; the text stays on the foreground.
        // Tone-coloured text on its own tint failed WCAG AA on the dark theme
        // (green 4.08:1, orange 3.09:1, red 3.43:1 at 12px).
        success: "border-success/60 bg-success/10 text-foreground",
        warning: "border-warning/60 bg-warning/10 text-foreground",
        destructive: "border-destructive/60 bg-destructive/10 text-foreground",
        accent: "border-accent/60 bg-accent/10 text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
