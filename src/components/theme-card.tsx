import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONFIDENCE_LABEL, type Confidence, type Theme } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ThemeCard({
  theme,
  selected,
  checked,
  editing,
  locked,
  onSelect,
  onToggleCheck,
  onStartEdit,
  onChange,
  onRemove,
  onJump,
}: {
  theme: Theme;
  selected: boolean;
  checked: boolean;
  editing: boolean;
  locked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  onStartEdit: () => void;
  onChange: (patch: Partial<Theme>) => void;
  onRemove: () => void;
  onJump: (code: string) => void;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border p-3",
        selected ? "border-primary bg-highlight/60" : "border-border bg-background",
      )}
    >
      <div className="flex items-start gap-2">
        {!locked ? (
          <input
            type="checkbox"
            className="mt-2.5 size-4 accent-primary"
            checked={checked}
            onChange={onToggleCheck}
            aria-label="병합할 주제 선택"
          />
        ) : null}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onSelect}>
          {editing && !locked ? (
            <Input
              value={theme.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="font-serif font-semibold"
            />
          ) : (
            <h3 className="font-serif text-base font-semibold tracking-tight">{theme.title}</h3>
          )}
        </button>
        <Badge
          variant="outline"
          className={
            theme.confidence === "low" ? "border-inju/40 text-inju" : undefined
          }
        >
          {CONFIDENCE_LABEL[theme.confidence]}
        </Badge>
        {!locked && !editing ? (
          <Button size="icon" variant="ghost" onClick={onStartEdit} aria-label="주제 편집">
            <Pencil className="size-4" />
          </Button>
        ) : null}
        {!locked ? (
          <Button size="icon" variant="ghost" onClick={onRemove} aria-label="주제 삭제">
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      {editing && !locked ? (
        <>
          <Textarea
            className="mt-2"
            rows={3}
            value={theme.summary}
            onFocus={onSelect}
            onChange={(e) => onChange({ summary: e.target.value })}
          />
          <Textarea
            className="mt-2"
            rows={2}
            value={theme.bullets.join("\n")}
            placeholder="핵심 한 줄씩"
            onFocus={onSelect}
            onChange={(e) => onChange({ bullets: e.target.value.split("\n") })}
          />
        </>
      ) : (
        <>
          {theme.summary ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{theme.summary}</p>
          ) : null}
          {theme.bullets.filter(Boolean).length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {theme.bullets.filter(Boolean).map((b, i) => (
                <li key={`${b}-${i}`}>{b}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {theme.sourceSegmentIds.map((code) => (
          <button
            key={code}
            type="button"
            className="h-8 rounded-sm border border-inju/30 bg-card px-2.5 font-mono text-xs text-inju"
            onClick={() => onJump(code)}
          >
            {code}
          </button>
        ))}
        {theme.sourceSegmentIds.length === 0 ? (
          <span className="text-xs text-inju">근거 구간 없음</span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {theme.quotes.map((q, i) =>
          editing && !locked ? (
            <div key={`${q.segmentId}-${i}`} className="grid grid-cols-[1fr_88px] gap-2">
              <Textarea
                rows={2}
                value={q.text}
                onChange={(e) => {
                  const quotes = theme.quotes.map((item, idx) =>
                    idx === i ? { ...item, text: e.target.value } : item,
                  );
                  onChange({ quotes });
                }}
              />
              <Input
                value={q.segmentId}
                className="font-mono text-xs"
                onChange={(e) => {
                  const quotes = theme.quotes.map((item, idx) =>
                    idx === i ? { ...item, segmentId: e.target.value } : item,
                  );
                  onChange({ quotes });
                }}
              />
            </div>
          ) : (
            <blockquote
              key={`${q.segmentId}-${i}`}
              className="border-l-2 border-inju/50 pl-3 font-serif text-sm leading-relaxed"
            >
              {q.text}
              <span className="mt-1 block font-sans font-mono text-xs text-muted-foreground">
                {q.segmentId}
              </span>
            </blockquote>
          ),
        )}
        {editing && !locked ? (
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() =>
              onChange({
                quotes: [...theme.quotes, { text: "", segmentId: theme.sourceSegmentIds[0] ?? "" }],
              })
            }
          >
            인용 추가
          </Button>
        ) : null}
      </div>

      {editing && !locked ? (
        <div className="mt-2">
          <label className="text-xs text-muted-foreground">확신</label>
          <select
            className="ml-2 h-8 rounded-md border border-input bg-card px-2 text-xs"
            value={theme.confidence}
            onChange={(e) => onChange({ confidence: e.target.value as Confidence })}
          >
            <option value="high">높음</option>
            <option value="medium">중간</option>
            <option value="low">낮음</option>
          </select>
        </div>
      ) : null}
    </article>
  );
}
