import { describe, expect, it } from "vitest";
import { assertBoardDistribution, boardCells, boardCoordinates, getBoardCell } from "@/lib/board";
import {
  calculateBasePosition,
  calculateFinalPosition,
  expiryAfterResume,
  remainingWhenPaused,
} from "@/lib/roll-rules";

describe("game board", () => {
  it("contains exactly 60 sequential cells with the approved distribution", () => {
    expect(boardCells.map((cell) => cell.number)).toEqual(Array.from({ length: 60 }, (_, index) => index + 1));
    expect(assertBoardDistribution()).toEqual({
      normal: 30,
      treasure: 9,
      surprise: 7,
      setback: 5,
      trap: 5,
      accelerate: 3,
      finish: 1,
    });
  });

  it("keeps one precise coordinate for every numbered cell", () => {
    expect(boardCoordinates).toHaveLength(60);
    for (const point of boardCoordinates) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(100);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(100);
    }
    const distances = boardCoordinates.slice(1).map((point, index) =>
      Math.hypot(point.x - boardCoordinates[index].x, point.y - boardCoordinates[index].y),
    );
    expect(Math.min(...distances)).toBeGreaterThan(5.5);
    expect(Math.max(...distances)).toBeLessThan(10);
  });

  it("finishes without requiring an exact roll", () => {
    expect(calculateBasePosition(58, 6)).toBe(60);
  });

  it("applies only the cell where movement ended", () => {
    expect(calculateFinalPosition(19, getBoardCell(19))).toBe(17);
    expect(calculateFinalPosition(27, getBoardCell(27))).toBe(29);
    expect(calculateFinalPosition(22, getBoardCell(22))).toBe(22);
  });
});

describe("paused roll timer", () => {
  it("continues with exactly the time that remained before a trap", () => {
    const awarded = new Date("2026-08-01T09:00:00.000Z");
    const originalExpiry = new Date(awarded.getTime() + 72 * 60 * 60 * 1000);
    const trapped = new Date(awarded.getTime() + 20 * 60 * 60 * 1000);
    const remaining = remainingWhenPaused(originalExpiry, trapped);
    expect(remaining).toBe(52 * 60 * 60 * 1000);
    const completed = new Date("2026-08-10T12:00:00.000Z");
    expect(expiryAfterResume(completed, remaining).toISOString()).toBe("2026-08-12T16:00:00.000Z");
  });
});
