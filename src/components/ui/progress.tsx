"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

/**
 * Radix supplies `role="progressbar"` and `aria-valuenow`, but not a NAME - and
 * an unnamed progress bar announces as a bare "70%", which answers nothing.
 * `label` is required so every bar says what it is measuring; pass
 * `labelHidden` when a visible heading already provides the text.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    label: string;
    labelledBy?: string;
  }
>(({ className, value, label, labelledBy, ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    aria-label={labelledBy ? undefined : label}
    aria-labelledby={labelledBy}
    aria-valuetext={`${Math.round(value ?? 0)}%`}
    className={cn("relative h-2 w-full overflow-hidden rounded-full bg-primary/20", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className="h-full w-full flex-1 bg-primary transition-all"
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
