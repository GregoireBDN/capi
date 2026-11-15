import * as React from "react";

import { cn } from "../lib/utils";

/* ============================================================================
 * TYPES
 * ========================================================================= */

type InputProps = React.ComponentProps<"input">;

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Input
 * Standard text input with consistent styling across light/dark modes
 * Supports all native input types (text, email, password, etc.)
 */
function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        [
          // Layout & Sizing
          "h-9 w-full min-w-0",

          // Spacing
          "px-3 py-1",

          // Styling
          "rounded-lg border border-input bg-transparent",

          // Typography
          "text-base md:text-sm",

          // Transitions
          "transition-colors outline-none",

          // Placeholder
          "placeholder:text-muted-foreground",

          // Date and time inputs: iOS Safari gives them a native look with
          // an intrinsic width that ignores w-full, so they stick out of
          // narrow containers (and let a sheet pan sideways), and centres
          // their value. A plain box keeps them as wide as the other fields.
          "[&[type=date]]:appearance-none",
          "[&[type=datetime-local]]:appearance-none",
          "[&[type=month]]:appearance-none",
          "[&[type=time]]:appearance-none",
          "[&::-webkit-date-and-time-value]:text-left",
          // An empty value would otherwise collapse to no height on iOS
          "[&::-webkit-date-and-time-value]:min-h-[1.5em]",

          // File Input Styling
          "file:inline-flex file:h-6 file:border-0 file:bg-transparent",
          "file:text-sm file:font-medium file:text-foreground",

          // Focus States
          "focus-visible:border-ring",
          "focus-visible:ring-3",
          "focus-visible:ring-ring/50",

          // Disabled States (Light)
          "disabled:pointer-events-none",
          "disabled:cursor-not-allowed",
          "disabled:bg-input/50",
          "disabled:opacity-50",

          // Invalid States (Light)
          "aria-invalid:border-destructive",
          "aria-invalid:ring-3",
          "aria-invalid:ring-destructive/20",

          // Dark Mode - Background
          "dark:bg-input/30",

          // Dark Mode - Disabled
          "dark:disabled:bg-input/80",

          // Dark Mode - Invalid
          "dark:aria-invalid:border-destructive/50",
          "dark:aria-invalid:ring-destructive/40",
        ].join(" "),
        className,
      )}
      {...props}
    />
  );
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { Input, type InputProps };
