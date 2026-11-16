import * as React from "react";

import { cn } from "../lib/utils";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "./empty";

/* ============================================================================
 * TYPES
 * ========================================================================= */

type EmptyStateProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** A lucide icon, shown in a small muted tile. */
  icon?: React.ReactNode;
  /** One short line saying what is missing. */
  title: React.ReactNode;
  /** Why, or what will show up here once it is fixed. */
  description?: React.ReactNode;
  /** The actions leading to the fix, the main one first. */
  actions?: React.ReactNode;
  /**
   * `page`: a dashed frame standing on its own in a page.
   * `inline`: inside a card or a chart area, no frame, tighter.
   */
  variant?: "page" | "inline";
};

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Empty State
 * The one way the app says something is empty: an icon, one short line, an
 * optional explanation and the action that fixes it (import, add an
 * account, set a target...). Built on the `Empty` primitives.
 */
function EmptyState({
  icon,
  title,
  description,
  actions,
  variant = "page",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <Empty
      data-variant={variant}
      className={cn(
        variant === "page" ? "border" : "gap-3 p-3",
        className,
      )}
      {...props}
    >
      <EmptyHeader>
        {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {actions && (
        <EmptyContent className="flex-row flex-wrap justify-center">
          {actions}
        </EmptyContent>
      )}
    </Empty>
  );
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { EmptyState };
export type { EmptyStateProps };
