import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./logger.js", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { mockSweep } = vi.hoisted(() => ({ mockSweep: vi.fn() }));

vi.mock("./attachment.service.js", () => ({
  sweepAbandonedAttachments: mockSweep,
}));

/** The interval is read from config at module load, so reload per scenario. */
async function loadScheduler(intervalMs: number) {
  vi.resetModules();
  vi.doMock("../config/config.js", () => ({
    attachmentCleanupIntervalMs: intervalMs,
  }));
  vi.doMock("./logger.js", () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  vi.doMock("./attachment.service.js", () => ({
    sweepAbandonedAttachments: mockSweep,
  }));
  return import("./cleanup.scheduler.js");
}

beforeEach(() => {
  vi.useFakeTimers();
  mockSweep.mockReset().mockResolvedValue({
    pendingDestroyed: 0,
    pendingFailed: 0,
    rejectedPruned: 0,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("../config/config.js");
});

describe("startAttachmentCleanup", () => {
  it("sweeps immediately and then on every interval", async () => {
    const { startAttachmentCleanup, stopAttachmentCleanup } =
      await loadScheduler(1000);

    startAttachmentCleanup();
    expect(mockSweep).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(mockSweep).toHaveBeenCalledTimes(4);

    stopAttachmentCleanup();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mockSweep).toHaveBeenCalledTimes(4);
  });

  it("does nothing when the interval is 0 (external cron deployment)", async () => {
    const { startAttachmentCleanup } = await loadScheduler(0);

    expect(startAttachmentCleanup()).toBeNull();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockSweep).not.toHaveBeenCalled();
  });

  it("starts only one timer even if called twice", async () => {
    const { startAttachmentCleanup, stopAttachmentCleanup } =
      await loadScheduler(1000);

    const first = startAttachmentCleanup();
    const second = startAttachmentCleanup();
    expect(second).toBe(first);

    await vi.advanceTimersByTimeAsync(1000);
    // One immediate pass plus one tick — not two of each.
    expect(mockSweep).toHaveBeenCalledTimes(2);
    stopAttachmentCleanup();
  });

  it("keeps running after a failed pass instead of taking the process down", async () => {
    const { startAttachmentCleanup, stopAttachmentCleanup } =
      await loadScheduler(1000);
    mockSweep.mockRejectedValueOnce(new Error("cloudinary down"));

    expect(() => startAttachmentCleanup()).not.toThrow();
    await vi.advanceTimersByTimeAsync(1000);

    expect(mockSweep).toHaveBeenCalledTimes(2);
    stopAttachmentCleanup();
  });
});
