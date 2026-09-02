import { describe, expect, it } from "vitest";
import {
  distinctMoscowSaleDays,
  hasJustInTimeRoll,
  longestConsecutiveMoscowSaleDays,
  maxEventsInSevenDays,
  maxForwardDistanceInThreeRolls,
  usedRollStreakWithoutExpiry,
  type CreditMetric,
} from "@/lib/achievement-metrics";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

describe("achievement metrics", () => {
  it("counts rolling seven-day sales and excludes the exact eighth-day boundary", () => {
    const start = Date.parse("2026-09-01T08:00:00.000Z");
    expect(maxEventsInSevenDays([start, start + day, start + 2 * day, start + 6 * day])).toBe(4);
    expect(maxEventsInSevenDays([start, start + 7 * day])).toBe(1);
  });

  it("tracks distinct and consecutive Moscow calendar days", () => {
    const sales = [
      Date.parse("2026-09-01T20:30:00.000Z"),
      Date.parse("2026-09-02T20:30:00.000Z"),
      Date.parse("2026-09-03T20:30:00.000Z"),
      Date.parse("2026-09-03T21:30:00.000Z"),
    ];
    expect(distinctMoscowSaleDays(sales)).toBe(4);
    expect(longestConsecutiveMoscowSaleDays(sales)).toBe(4);
  });

  it("resets the used-roll streak only when a roll expires", () => {
    const credits: CreditMetric[] = Array.from({ length: 6 }, (_, index) => ({
      status: "used",
      awardedAt: index,
      usedAt: index + 1,
      expiredAt: null,
      expiresAt: 100,
    }));
    credits.splice(3, 0, { status: "expired", awardedAt: 3, usedAt: null, expiredAt: 3.5, expiresAt: 3.5 });
    expect(usedRollStreakWithoutExpiry(credits)).toBe(3);
  });

  it("recognizes a used roll with no more than three hours remaining", () => {
    const usedAt = Date.parse("2026-09-01T12:00:00.000Z");
    expect(hasJustInTimeRoll([{ status: "used", awardedAt: 0, usedAt, expiredAt: null, expiresAt: usedAt + 3 * hour }])).toBe(true);
    expect(hasJustInTimeRoll([{ status: "used", awardedAt: 0, usedAt, expiredAt: null, expiresAt: usedAt + 3 * hour + 1 }])).toBe(false);
  });

  it("counts net forward movement in exactly three consecutive rolls", () => {
    const rolls = [
      { cellType: "normal", startPosition: 0, finalPosition: 4, createdAt: 1 },
      { cellType: "setback", startPosition: 4, finalPosition: 6, createdAt: 2 },
      { cellType: "accelerate", startPosition: 6, finalPosition: 12, createdAt: 3 },
    ];
    expect(maxForwardDistanceInThreeRolls(rolls)).toBe(12);
  });
});
