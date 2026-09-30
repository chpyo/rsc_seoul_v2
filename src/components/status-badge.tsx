import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type SessionStatus } from "@/lib/types";

const variant: Record<SessionStatus, "uploaded" | "draft" | "confirmed"> = {
  uploaded: "uploaded",
  analyzed: "draft",
  confirmed: "confirmed",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  return <Badge variant={variant[status]}>{STATUS_LABEL[status]}</Badge>;
}
