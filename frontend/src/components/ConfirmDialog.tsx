import Spinner from "./Spinner";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
}

/** Rendered by its caller only while the question is open, which is why the
 *  dialog is held open here: dismissing it — Escape, the backdrop, Cancel —
 *  is the same answer, so all three land on onCancel and the caller unmounts
 *  it. No close affordance beyond that; a confirmation wants a choice, not an
 *  escape hatch dressed as one. */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  danger = true,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onCancel();
      }}
    >
      <DialogContent showCloseButton={false} className="gap-5 p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-[-0.012em]">
            {title}
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            {message}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="-mx-5 -mb-5 gap-2 p-4">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
            className="h-9 rounded-full px-4"
          >
            Cancel
          </Button>
          <Button
            variant={danger ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
            className="h-9 rounded-full px-4"
          >
            {loading && <Spinner className="size-3.5" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
