import { useRef } from "react";
import { ArrowUp, Paperclip, X } from "lucide-react";
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
} from "../../services/api/attachmentApi";
import Spinner from "../Spinner";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

export interface PendingAttachment {
  attachmentId: string;
  name: string;
  status: "uploading" | "ready" | "error";
  error?: string;
}

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFilesPicked: (files: File[]) => void;
  attachments: PendingAttachment[];
  onRemoveAttachment: (attachmentId: string) => void;
  /** True while a message is in flight, a conversation is loading, or there
   *  is no conversation to post into. */
  disabled: boolean;
  sending: boolean;
  enterSends: boolean;
  maxLength: number;
}

export default function ChatComposer({
  value,
  onChange,
  onSubmit,
  onFilesPicked,
  attachments,
  onRemoveAttachment,
  disabled,
  sending,
  enterSends,
  maxLength,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploading = attachments.some((a) => a.status === "uploading");
  const canSend = !disabled && !uploading && value.trim().length > 0;

  // Shown only once it is information. A counter that sits at 0/3000 all day
  // is a number, not a warning.
  const remaining = maxLength - value.length;
  const showCount = value.length >= maxLength - 500;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    // Mid-composition Enter belongs to the IME, which is picking a candidate.
    if (e.nativeEvent.isComposing) return;

    const modifier = e.ctrlKey || e.metaKey;
    const sends = enterSends ? !e.shiftKey && !modifier : modifier;
    if (!sends) return;

    e.preventDefault();
    if (canSend) onSubmit();
  };

  return (
    <div className="shrink-0 bg-background px-3 pb-3 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-3xl">
        {attachments.length > 0 && (
          <ul className="m-0 mb-2 flex list-none flex-wrap gap-2 p-0">
            {attachments.map((a) => (
              <li
                key={a.attachmentId}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                  a.status === "error"
                    ? "border-destructive/40 text-destructive"
                    : "border-border text-muted-foreground"
                }`}
              >
                {a.status === "uploading" && <Spinner className="size-3" />}
                <span className="max-w-[22ch] truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(a.attachmentId)}
                  aria-label={`Remove ${a.name}`}
                  className="-mr-1 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* One control with three parts, which is why the frame takes the
            focus rather than the field inside it. */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) onSubmit();
          }}
          className="chat-composer flex items-end gap-1.5 rounded-[20px] border border-border bg-muted p-2 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(",")}
            multiple
            onChange={(e) => {
              onFilesPicked(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
            className="hidden"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            aria-label="Attach a photo or report"
            className="size-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <Paperclip aria-hidden="true" />
          </Button>

          {/* field-sizing-content grows the box with the text; the cap is what
              stops a long paragraph eating the transcript. */}
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your symptoms..."
            disabled={disabled}
            maxLength={maxLength}
            rows={1}
            className="chat-prose max-h-40 min-h-9 flex-1 resize-none self-center overflow-y-auto rounded-none border-0 bg-transparent py-2 pr-1 pl-0.5 shadow-none focus-visible:ring-0 md:text-[0.975rem]"
          />

          <Button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="size-9 shrink-0 rounded-full"
          >
            {sending ? (
              <Spinner className="size-3.5" />
            ) : (
              <ArrowUp aria-hidden="true" />
            )}
          </Button>
        </form>

        <div className="mt-2 flex items-baseline justify-between gap-4 px-1">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Educational guidance only. Botony does not diagnose, and is not a
            substitute for a healthcare professional.
          </p>
          {showCount && (
            <p
              className={`chat-figure shrink-0 text-xs ${
                remaining <= 100 ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {remaining} left
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
