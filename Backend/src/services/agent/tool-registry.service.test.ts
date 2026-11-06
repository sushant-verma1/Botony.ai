import { describe, expect, it, vi } from "vitest";
const { mockEmbedTextWithGemini } = vi.hoisted(() => ({
  mockEmbedTextWithGemini: vi.fn(),
}));
vi.mock("../ai/gemini.provider.js", () => ({ embedTextWithGemini: mockEmbedTextWithGemini }));
import { toolRegistry } from "./tool-registry.service.js";

describe("agent tool registry", () => {
  it("loads only relevant medicine schemas from the catalog", async () => {
    mockEmbedTextWithGemini.mockImplementation(async (texts: string[]) => texts.map((text) =>
      text.includes("change an existing") || text.includes("updateMedicineSchedule") ? [1, 0] : [0, 1],
    ));
    const tools = await toolRegistry.search("change an existing medicine reminder");
    expect(tools.map((tool) => tool.name)).toContain("updateMedicineSchedule");
    expect(tools.map((tool) => tool.name)).toContain("createMedicineSchedule");
    expect(tools.length).toBeLessThanOrEqual(8);
  });

  it("marks reminder mutations as confirmation-required", () => {
    expect(toolRegistry.get("createMedicineSchedule")?.requiresConfirmation).toBe(true);
    expect(toolRegistry.get("updateMedicineSchedule")?.requiresConfirmation).toBe(true);
    expect(toolRegistry.get("deleteMedicineSchedule")?.requiresConfirmation).toBe(true);
    expect(toolRegistry.get("getMedicineSchedules")?.requiresConfirmation).toBe(false);
  });
});
