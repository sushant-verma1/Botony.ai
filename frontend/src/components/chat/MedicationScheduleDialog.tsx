import { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { agentAPI, type MedicationScheduleProposalResponse } from "../../services/api/agentApi";
import Spinner from "../Spinner";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Textarea } from "../ui/textarea";

interface MedicationScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function readableTimes(times: string[]): string {
  return times.join(", ");
}

export default function MedicationScheduleDialog({
  open,
  onOpenChange,
}: MedicationScheduleDialogProps) {
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<MedicationScheduleProposalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) return;
    setRequest("");
    setDraft(null);
    setError(null);
    setDrafting(false);
    setConfirming(false);
  }, [open]);

  const messageFrom = (unknownError: unknown, fallback: string) =>
    axios.isAxiosError(unknownError)
      ? unknownError.response?.data?.message || fallback
      : fallback;

  const handleDraft: React.SubmitEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (!request.trim()) return;
    setError(null);
    setDrafting(true);
    try {
      const { data } = await agentAPI.draftMedicationSchedule(request.trim());
      if (data.kind === "clarification") {
        setError(data.question);
      } else {
        setDraft(data);
      }
    } catch (unknownError) {
      setError(messageFrom(unknownError, "Could not create a schedule proposal."));
    } finally {
      setDrafting(false);
    }
  };

  const handleConfirm = async () => {
    if (!draft) return;
    setError(null);
    setConfirming(true);
    try {
      await agentAPI.confirmMedicationSchedule(
        draft.action.id,
        draft.confirmationToken,
      );
      toast.success("Medication reminder schedule created");
      onOpenChange(false);
    } catch (unknownError) {
      setError(messageFrom(unknownError, "Could not confirm this schedule."));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-[-0.012em]">
            Schedule medicine
          </DialogTitle>
          <DialogDescription className="leading-relaxed">
            Describe the reminder you want. Botony can use an active medicine
            already saved to your account or propose a new one for your review.
          </DialogDescription>
        </DialogHeader>

        {!draft ? (
          <form id="medication-schedule-form" onSubmit={handleDraft}>
            <FieldGroup className="gap-4">
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="medication-schedule-request">
                  Reminder request
                </FieldLabel>
                <Textarea
                  id="medication-schedule-request"
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  placeholder="Remind me to take Paracetamol 500 mg at 08:00 and 20:00 in Asia/Kolkata, starting 2026-11-05."
                  maxLength={1000}
                  rows={5}
                  aria-invalid={!!error || undefined}
                />
                <FieldError>{error}</FieldError>
              </Field>
            </FieldGroup>
          </form>
        ) : (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">Review before confirming</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[9rem_1fr]">
              {draft.draft.newMedication && (
                <>
                  <dt className="text-muted-foreground">Medicine to save</dt>
                  <dd>{draft.draft.newMedication.name}{draft.draft.newMedication.strength ? ` · ${draft.draft.newMedication.strength}` : ""}{draft.draft.newMedication.form ? ` · ${draft.draft.newMedication.form}` : ""}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Reminder times</dt>
              <dd>{readableTimes(draft.draft.times)}</dd>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd>{draft.draft.timezone}</dd>
              <dt className="text-muted-foreground">Starts</dt>
              <dd>{draft.draft.startsOn}</dd>
              {draft.draft.endsOn && (
                <>
                  <dt className="text-muted-foreground">Ends</dt>
                  <dd>{draft.draft.endsOn}</dd>
                </>
              )}
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Confirming creates the reminder{draft.draft.newMedication ? " and saves the medicine shown above" : ""}. It does not prescribe or change your dose or medical instructions.
            </p>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="-mx-5 -mb-5 gap-2 p-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={drafting || confirming}
            className="h-9 rounded-full px-4"
          >
            Cancel
          </Button>
          {!draft ? (
            <Button
              type="submit"
              form="medication-schedule-form"
              disabled={drafting || !request.trim()}
              className="h-9 rounded-full px-4"
            >
              {drafting && <Spinner className="size-3.5" />}
              {drafting ? "Creating proposal..." : "Review proposal"}
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={confirming}
              className="h-9 rounded-full px-4"
            >
              {confirming && <Spinner className="size-3.5" />}
              {confirming ? "Creating schedule..." : "Confirm schedule"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
