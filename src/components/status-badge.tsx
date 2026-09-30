import { Stamp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type SessionStatus } from "@/lib/types";

const variant: Record<SessionStatus, "uploaded" | "draft" | "confirmed"> = {
  uploaded: "uploaded",
  analyzed: "draft",
  confirmed: "confirmed",
};

/** 목록용 단계 표시. 확정만 인주색 + 도장 아이콘. */
export function StatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge variant={variant[status]} className="gap-1">
      {status === "confirmed" ? <Stamp className="size-3" aria-hidden /> : null}
      {STATUS_LABEL[status]}
    </Badge>
  );
}
