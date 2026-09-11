import { TriangleAlert } from "lucide-react";
import type { ChatMessage } from "../types/chat";
import Mark from "./Mark";

interface MessageBubbleProps {
  message: ChatMessage;
}

/** The rail on the left of every turn. Holds the mark for Botony and nothing
 *  for you — which is the point: the product has a face, you do not, and the
 *  plate under your own words already says whose they are. */
function Rail({ children }: { children?: React.ReactNode }) {
  return <div className="w-7 shrink-0 pt-[0.6rem]">{children}</div>;
}

function MessageBubble({ message }: MessageBubbleProps) {
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
      <article className="chat-turn flex gap-3 sm:gap-4">
        <Rail />
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
      </div>
    </article>
  );
}

export default MessageBubble;
