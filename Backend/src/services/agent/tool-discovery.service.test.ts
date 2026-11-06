import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateToolCalls } = vi.hoisted(() => ({
  mockGenerateToolCalls: vi.fn(),
}));

vi.mock("../ai/index.js", () => ({
  generateToolCalls: mockGenerateToolCalls,
}));

import { discoverToolCall } from "./tool-discovery.service.js";

describe("direct native tool discovery", () => {
  beforeEach(() => mockGenerateToolCalls.mockReset());

  it("uses one AUTO-capable catalog selection for a misspelled medication request", async () => {
    mockGenerateToolCalls.mockResolvedValue({
      text: "",
      toolCalls: [{ name: "createMedicineSchedule", arguments: { request: "scedule vitamin d" } }],
      provider: "gemini",
      model: "gemini-3.6-flash",
    });

    const result = await discoverToolCall([
      { role: "user", content: "scedule vitamin d" },
    ]);

    expect(mockGenerateToolCalls).toHaveBeenCalledTimes(1);
    const [, tools] = mockGenerateToolCalls.mock.calls[0];
    expect(tools.map((tool: { name: string }) => tool.name)).toContain("createMedicineSchedule");
    expect(result).toMatchObject({
      tool: { name: "createMedicineSchedule" },
      arguments: { request: "scedule vitamin d" },
      provider: "gemini",
    });
  });

  it("does not infer out-of-scope intent when AUTO returns normal text", async () => {
    mockGenerateToolCalls.mockResolvedValue({
      text: "Could you clarify whether you want a vitamin D reminder?",
      toolCalls: [],
      provider: "groq",
      model: "qwen/qwen3.8-27b",
    });

    await expect(discoverToolCall([{ role: "user", content: "scedule vitamin d" }]))
      .resolves.toMatchObject({
        text: "Could you clarify whether you want a vitamin D reminder?",
        provider: "groq",
      });
  });
});
