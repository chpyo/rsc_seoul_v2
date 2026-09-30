import { cn } from "@/lib/utils";

/**
 * 조사록 인장. 네모난 도장 안에 '록(錄)'.
 * 브랜드 표시이자 "사람이 검증해 확정한 기록"의 표시이므로 기본색은 인주(text-inju)를 쓴다.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("block text-inju", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="4" fill="currentColor" />
      <rect
        x="3.6"
        y="3.6"
        width="24.8"
        height="24.8"
        rx="1.6"
        fill="none"
        stroke="var(--color-inju-foreground)"
        strokeWidth="1.1"
      />
      <g
        fill="none"
        stroke="var(--color-inju-foreground)"
        strokeWidth="1.9"
        strokeLinecap="square"
        strokeLinejoin="miter"
      >
        <path d="M9.5 8.2H22.3V11H9.7V13.8H22.5" />
        <path d="M16 14.9V17.4" />
        <path d="M8.4 17.6H23.6" />
        <path d="M9.6 20.2H22.2V24.2" />
      </g>
    </svg>
  );
}
