import { describe, it, expect } from "vitest";
import { createReasoningFilter, splitReasoning } from "./reasoning.js";

describe("splitReasoning", () => {
  it("keeps ordinary content untouched", () => {
    const result = splitReasoning("Rest, fluids, and paracetamol may help.");

    expect(result.text).toBe("Rest, fluids, and paracetamol may help.");
    expect(result.reasoning).toBeUndefined();
    expect(result.inlineBlocksStripped).toBe(0);
  });

  it("takes the provider's explicit reasoning field without touching text", () => {
    const result = splitReasoning("Drink water.", "The user asks about X...");

    expect(result.text).toBe("Drink water.");
    expect(result.reasoning).toBe("The user asks about X...");
    expect(result.inlineBlocksStripped).toBe(0);
  });

  it("strips an inline <think> block into reasoning", () => {
    const result = splitReasoning(
      "<think>Differential: tension vs migraine. Patient says mild.</think>\nTension headaches are usually muscular.",
    );

    expect(result.text).toBe("Tension headaches are usually muscular.");
    expect(result.text).not.toContain("<think>");
    expect(result.text).not.toContain("Differential");
    expect(result.reasoning).toContain("Differential");
    expect(result.inlineBlocksStripped).toBe(1);
  });

  it("strips an unterminated <think> block from a truncated response", () => {
    const result = splitReasoning(
      "Here is some text.\n<think>I should consider whether this is an emerg",
    );

    expect(result.text).toBe("Here is some text.");
    expect(result.text).not.toContain("<think>");
    expect(result.reasoning).toContain("emerg");
    expect(result.inlineBlocksStripped).toBe(1);
  });

  it("handles multiple blocks and attributes on the tag", () => {
    const result = splitReasoning(
      "<think>one</think>Answer part A.<think>two</think> Answer part B.",
    );

    expect(result.text).toBe("Answer part A. Answer part B.");
    expect(result.inlineBlocksStripped).toBe(2);
    expect(result.reasoning).toContain("one");
    expect(result.reasoning).toContain("two");
  });

  it("yields empty text when the response was nothing but reasoning", () => {
    // The provider turns this into an AIProviderError rather than showing it.
    const result = splitReasoning("<think>only thinking, never finished</think>");

    expect(result.text).toBe("");
    expect(result.reasoning).toContain("only thinking");
  });
});

describe("createReasoningFilter", () => {
  /** Feeds chunks through the filter and returns everything visible. */
  function run(chunks: string[]) {
    const filter = createReasoningFilter();
    const visible = chunks.map((chunk) => filter.push(chunk)).join("");
    return {
      text: visible + filter.flush(),
      stripped: filter.inlineBlocksStripped,
    };
  }

  it("passes ordinary text straight through", () => {
    expect(run(["Rest, ", "fluids, ", "and paracetamol."]).text).toBe(
      "Rest, fluids, and paracetamol.",
    );
  });

  it("holds back a chunk ending mid-tag until the next chunk decides", () => {
    const filter = createReasoningFilter();

    // "<th" could still become "<think", so it is not emitted yet.
    expect(filter.push("Answer <th")).toBe("Answer ");
    expect(filter.push("anks for asking")).toBe("<thanks for asking");
    expect(filter.flush()).toBe("");
  });

  it("strips a think block that is split across chunks", () => {
    const result = run(["visible <thi", "nk>hidden reason", "ing</think> tail"]);

    expect(result.text).toBe("visible  tail");
    expect(result.text).not.toContain("hidden");
    expect(result.stripped).toBe(1);
  });

  it("strips a think block with attributes on the opening tag", () => {
    expect(run(['a <think type="x">no</think> b']).text).toBe("a  b");
  });

  it("drops an unterminated block entirely rather than flushing it", () => {
    const result = run(["answer <think>truncated mid-thou"]);

    expect(result.text).toBe("answer ");
    expect(result.stripped).toBe(1);
  });

  it("handles several blocks in one stream", () => {
    expect(run(["<think>a</think>one <think>b</think>two"]).text).toBe(
      "one two",
    );
  });
});
