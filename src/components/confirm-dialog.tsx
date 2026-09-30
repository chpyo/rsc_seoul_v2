import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoaderCircle, AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "default";
  isLoading?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "확인",
  cancelText = "취소",
  variant = "destructive",
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !isLoading && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {variant === "destructive" ? (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive mt-0.5">
                <AlertTriangle className="size-5" />
              </div>
            ) : null}
            <div className="space-y-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground whitespace-pre-line">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={() => onConfirm()}
            disabled={isLoading}
          >
            {isLoading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
