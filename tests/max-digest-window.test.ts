import { describe, expect, it } from "vitest";
import { getDailyDigestWindow } from "@/lib/max-digest-window";

describe("daily MAX digest window", () => {
  it("reports the fully completed previous Moscow day at 00:05", () => {
    const window = getDailyDigestWindow(new Date("2026-09-01T21:05:00.000Z"));
    expect(window.shouldSend).toBe(true);
    expect(window.reportDateKey).toBe("2026-09-01");
    expect(window.dayStart.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(window.dayEnd.toISOString()).toBe("2026-09-01T21:00:00.000Z");
  });

  it("allows retries through 00:15 and rejects later calls", () => {
    expect(getDailyDigestWindow(new Date("2026-09-01T21:15:00.000Z")).shouldSend).toBe(true);
    expect(getDailyDigestWindow(new Date("2026-09-01T21:16:00.000Z")).shouldSend).toBe(false);
  });
});
