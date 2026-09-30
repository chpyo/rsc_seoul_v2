import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-start gap-2 py-8", className)}>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
