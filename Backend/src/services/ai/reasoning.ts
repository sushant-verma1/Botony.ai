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
