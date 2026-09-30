import { cn } from "@/lib/utils";

function sealDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 확정 인장. 사람이 검토해 확정한 기록에만 찍는다(인주색 전용 용도).
 * 화면과 인쇄 모두에서 같은 모양으로 나온다.
 */
export function ConfirmSeal({
  confirmedAt,
  size = "md",
  className,
}: {
  confirmedAt?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const date = sealDate(confirmedAt);
  return (
    <span
      role="img"
      aria-label={date ? `20${date} 확정` : "확정"}
      title={date ? `20${date} 확정된 기록` : "확정된 기록"}
      className={cn(
        "inline-flex shrink-0 -rotate-6 select-none flex-col items-center justify-center rounded-[3px] border-2 border-inju text-inju",
        "outline-1 outline-offset-2 outline-inju/60 outline-solid",
        size === "md" ? "size-[4.5rem] gap-1" : "size-11 gap-0",
        className,
      )}
    >
      <span
        className={cn(
          "pl-[0.2em] font-serif font-bold tracking-[0.2em]",
          size === "md" ? "text-lg/none" : "text-sm/none",
        )}
      >
        확정
      </span>
      {date ? (
        <span
          className={cn(
            "font-mono tabular-nums",
            size === "md" ? "text-xs/none" : "hidden",
          )}
        >
          {date}
        </span>
      ) : null}
    </span>
  );
}
