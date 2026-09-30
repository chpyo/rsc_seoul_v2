import { cn } from "@/lib/utils";

/** Stamp mark: citation rule + S, used in header, login, favicon. */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("block", className)} aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="5" fill="currentColor" />
      <rect
        x="4.25"
        y="4.25"
        width="23.5"
        height="23.5"
        rx="2.5"
        fill="none"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.15"
      />
      <path
        d="M20.6 11.1c0-1.45-1.35-2.45-4.05-2.45-2.55 0-4.15.95-4.15 2.55 0 1.4 1.15 2.15 3.85 2.55l1.05.15c2.2.35 3.55 1.15 3.55 2.85 0 1.85-1.7 2.95-4.7 2.95-2.55 0-4.45-.9-4.7-2.85"
        fill="none"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
      <path
        d="M10.5 23.4h11"
        fill="none"
        stroke="var(--color-primary-foreground)"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}
