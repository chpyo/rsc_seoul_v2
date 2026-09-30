import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * 근거 분포 막대. 대화 전체를 가로 한 줄로 놓고, 근거로 연결된 구간이 어디에 몰려 있는지 표시한다.
 *   진한 청록: 선택한 주제의 근거 / 옅은 청록: 마우스를 올린 주제 / 인주: 다른 주제의 근거
 * 표시를 누르면 그 구간으로 이동한다.
 */
export function EvidenceStrip({
  codes,
  linked,
  selected,
  hovered,
  cursor,
  onJump,
}: {
  /** 대화 순서대로의 전체 구간 코드 */
  codes: string[];
  /** 어느 주제든 근거로 연결된 구간 */
  linked: Set<string>;
  selected: Set<string>;
  hovered: Set<string>;
  cursor?: string | null;
  onJump: (code: string) => void;
}) {
  const n = codes.length;
  const marks = useMemo(
    () =>
      codes
        .map((code, i) => ({ code, i }))
        .filter(({ code }) => linked.has(code) || selected.has(code) || hovered.has(code)),
    [codes, linked, selected, hovered],
  );
  if (n === 0) return null;
  const width = `max(${100 / n}%, 3px)`;
  const cursorIndex = cursor ? codes.indexOf(cursor) : -1;

  return (
    <div className="flex flex-col gap-1">
      <div
        className="relative h-5 w-full overflow-hidden rounded-sm bg-muted"
        role="group"
        aria-label={`근거 분포: 전체 ${n}개 구간 중 선택한 주제의 근거 ${selected.size}개`}
      >
        {marks.map(({ code, i }) => (
          <button
            key={code}
            type="button"
            tabIndex={-1}
            title={code}
            aria-label={`${code}로 이동`}
            onClick={() => onJump(code)}
            className={cn(
              "absolute inset-y-0 hover:opacity-80",
              selected.has(code)
                ? "z-20 bg-primary"
                : hovered.has(code)
                  ? "z-10 bg-primary/45"
                  : "bg-inju/35",
            )}
            style={{ left: `${(i / n) * 100}%`, width }}
          />
        ))}
        {cursorIndex >= 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-foreground"
            style={{ left: `${((cursorIndex + 0.5) / n) * 100}%` }}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-[2px] bg-primary" aria-hidden />
          선택한 주제 {selected.size}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-[2px] bg-inju/35" aria-hidden />
          다른 주제의 근거
        </span>
        <span className="ml-auto tabular-nums">처음 → 끝 · {n}개 구간</span>
      </div>
    </div>
  );
}
