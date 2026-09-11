/**
 * Reasoning models return their chain of thought alongside the answer. It is
 * never shown to a patient and never persisted — see AIResponse.reasoning.
 *
 * The real separation happens at the provider:
 *   - Groq: `reasoning_format: "parsed"` puts it in `message.reasoning`.
 *   - Gemini: the SDK's `.text` getter already skips `part.thought` parts.
 *
 * What is left here is a last-resort net for the case where a model still
 * emits an inline <think> block in ordinary content — GROQ_MODEL is
 * env-configurable, so a model swap must not be able to silently put chain of
 * thought back into medical advice. `inlineBlocksStripped > 0` means the
 * provider request is misconfigured for that model, not that this net is
 * doing routine work.
 */

// Closed block first, then an unterminated one: a response truncated mid-
// thought has an opening tag and no closing tag, and everything after it is
// reasoning too.
const CLOSED_THINK_BLOCK = /<think\b[^>]*>[\s\S]*?<\/think\s*>/gi;
const UNCLOSED_THINK_BLOCK = /<think\b[^>]*>[\s\S]*$/i;

export interface SplitReasoning {
  text: string;
  reasoning?: string;
  inlineBlocksStripped: number;
}

export function splitReasoning(
  content: string,
  providerReasoning?: string | null,
): SplitReasoning {
  const stripped: string[] = [];

  const collect = (block: string) => {
    stripped.push(block);
    return "";
  };

  const text = content
    .replace(CLOSED_THINK_BLOCK, collect)
    .replace(UNCLOSED_THINK_BLOCK, collect)
    .trim();

  const reasoning = [providerReasoning ?? "", ...stripped]
    .filter((part) => part.trim().length > 0)
    .join("\n\n")
    .trim();

  return {
    text,
    reasoning: reasoning.length > 0 ? reasoning : undefined,
    inlineBlocksStripped: stripped.length,
  };
}

/**
 * The streaming counterpart of splitReasoning: same net, applied to a text
 * stream where a `<think>` tag can be split across two chunks. Chunks go in,
 * only user-visible text comes out — anything from `<think` to `</think>` is
 * withheld, and so is a trailing partial tag until the next chunk decides
 * what it is.
 */
export interface ReasoningFilter {
  /** Visible text from this chunk, possibly "" while a tag is pending. */
  push(chunk: string): string;
  /** Any withheld visible tail. An unterminated block is dropped entirely. */
  flush(): string;
  /** > 0 means the provider request is misconfigured for that model. */
  readonly inlineBlocksStripped: number;
}

const OPEN_TAG = "<think";
const CLOSE_TAG = "</think";

// Longest suffix of `text` that could still grow into `tag`.
function pendingTagLength(text: string, tag: string): number {
  const max = Math.min(text.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (text.slice(-n).toLowerCase() === tag.slice(0, n)) return n;
  }
  return 0;
}

export function createReasoningFilter(): ReasoningFilter {
  let buffer = "";
  let inThink = false;
  let stripped = 0;

  function drain(final: boolean): string {
    let visible = "";

    for (;;) {
      if (inThink) {
        const start = buffer.toLowerCase().indexOf(CLOSE_TAG);
        const end = start === -1 ? -1 : buffer.indexOf(">", start);

        if (end === -1) {
          // Still inside the block: drop it, keeping only enough tail for a
          // closing tag split across chunks.
          buffer = final ? "" : buffer.slice(-(CLOSE_TAG.length - 1));
          return visible;
        }

        buffer = buffer.slice(end + 1);
        inThink = false;
        continue;
      }

      const open = buffer.toLowerCase().indexOf(OPEN_TAG);
      if (open !== -1) {
        visible += buffer.slice(0, open);
        buffer = buffer.slice(open + OPEN_TAG.length);
        inThink = true;
        stripped++;
        continue;
      }

      const pending = final ? 0 : pendingTagLength(buffer, OPEN_TAG);
      visible += buffer.slice(0, buffer.length - pending);
      buffer = pending ? buffer.slice(buffer.length - pending) : "";
      return visible;
    }
  }

  return {
    push: (chunk) => {
      buffer += chunk;
      return drain(false);
    },
    flush: () => drain(true),
    get inlineBlocksStripped() {
      return stripped;
    },
  };
}
