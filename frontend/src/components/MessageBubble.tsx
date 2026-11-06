import { TriangleAlert } from "lucide-react";
import type { ChatMessage, MedicationScheduleProposal, MedicineScheduleMutationProposal } from "../types/chat";
import Mark from "./Mark";
import { Button } from "./ui/button";

interface MessageBubbleProps {
  message: ChatMessage;
  /** True only for the message the user just sent in this session — it
   *  rises into place instead of the ordinary fade-in every turn gets. */
  justSent?: boolean;
  onConfirmMedicationSchedule?: (proposal: MedicationScheduleProposal) => void;
  onConfirmMedicineScheduleMutation?: (proposal: MedicineScheduleMutationProposal) => void;
  confirmingMedicationSchedule?: boolean;
}

/** The rail on the left of every turn. Holds the mark for Botony and nothing
 *  for you — which is the point: the product has a face, you do not, and the
 *  plate under your own words already says whose they are. */
function Rail({ children }: { children?: React.ReactNode }) {
  return <div className="w-7 shrink-0 pt-[0.6rem]">{children}</div>;
}

function MessageBubble({
  message,
  justSent,
  onConfirmMedicationSchedule,
  onConfirmMedicineScheduleMutation,
  confirmingMedicationSchedule = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isEmergency = message.emergencyDetected;

  if (!isUser && isEmergency) {
    return (
      <article className="chat-turn flex gap-3 sm:gap-4">
        <Rail>
          <Mark className="w-7" />
        </Rail>
        {/* The only filled block in the product. A page that has never once
            put ink behind text does not need red to be read as an alarm —
            but the icon takes the one saturated colour there is, because a
            reader skimming for the shape of the thing should find it before
            they find the words. */}
        <div className="min-w-0 max-w-[62ch] rounded-2xl bg-foreground px-5 py-4 text-background">
          <p className="chat-label flex items-center gap-2 text-background/75">
            <TriangleAlert
              className="size-3.5 text-[var(--alarm)]"
              aria-hidden="true"
            />
            Emergency
          </p>
          <p className="chat-prose mt-2.5 font-medium">{message.content}</p>
        </div>
      </article>
    );
  }

  if (isUser) {
    return (
      <article
        className="chat-turn flex justify-end gap-3 sm:gap-4"
        data-sent={justSent || undefined}
      >
        <div className="min-w-0 max-w-[54ch] rounded-2xl bg-muted px-4 py-3">
          <h3 className="sr-only">You</h3>
          <p className="chat-prose">{message.content}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="chat-turn flex gap-3 sm:gap-4">
      <Rail>
        <Mark className="w-7" />
      </Rail>
      {/* No container. The answer is the page. */}
      <div className="min-w-0 max-w-[68ch] pt-px">
        <h3 className="sr-only">Botony</h3>
        <p className="chat-prose">{message.content}</p>
        {message.medicationScheduleProposal && (
          <section className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">Review medication reminder</p>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
              {message.medicationScheduleProposal.draft.newMedication && (
                <>
                  <dt className="text-muted-foreground">Medicine to save</dt>
                  <dd>{message.medicationScheduleProposal.draft.newMedication.name}{message.medicationScheduleProposal.draft.newMedication.strength ? ` · ${message.medicationScheduleProposal.draft.newMedication.strength}` : ""}{message.medicationScheduleProposal.draft.newMedication.form ? ` · ${message.medicationScheduleProposal.draft.newMedication.form}` : ""}</dd>
                </>
              )}
        {message.medicineScheduleMutationProposal && (
          <section className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium">Review medicine reminder {message.medicineScheduleMutationProposal.operation === "deleteMedicineSchedule" ? "deletion" : "update"}</p>
            <p className="mt-2 text-xs text-muted-foreground">This change will only be applied after you confirm.</p>
            <Button className="mt-4" onClick={() => onConfirmMedicineScheduleMutation?.(message.medicineScheduleMutationProposal!)} disabled={!onConfirmMedicineScheduleMutation || confirmingMedicationSchedule}>
              {confirmingMedicationSchedule ? "Confirming..." : "Confirm change"}
            </Button>
          </section>
        )}
              <dt className="text-muted-foreground">Time</dt>
              <dd>{message.medicationScheduleProposal.draft.times.join(", ")}</dd>
              <dt className="text-muted-foreground">Timezone</dt>
              <dd>{message.medicationScheduleProposal.draft.timezone}</dd>
              <dt className="text-muted-foreground">Starts</dt>
              <dd>{message.medicationScheduleProposal.draft.startsOn}</dd>
              {message.medicationScheduleProposal.draft.endsOn && (
                <>
                  <dt className="text-muted-foreground">Ends</dt>
                  <dd>{message.medicationScheduleProposal.draft.endsOn}</dd>
                </>
              )}
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Confirming creates an in-app reminder{message.medicationScheduleProposal.draft.newMedication ? " and saves this medicine" : ""}. It does not prescribe or change a dose.
            </p>
            <Button
              className="mt-4"
              onClick={() => onConfirmMedicationSchedule?.(message.medicationScheduleProposal!)}
              disabled={!onConfirmMedicationSchedule || confirmingMedicationSchedule}
            >
              {confirmingMedicationSchedule ? "Creating schedule..." : "Confirm schedule"}
            </Button>
          </section>
        )}
      </div>
    </article>
  );
}

export default MessageBubble;
