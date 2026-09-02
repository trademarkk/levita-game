import type { BoardCell } from "@/lib/types";

export const ROLL_TTL_MS = 72 * 60 * 60 * 1000;

export function calculateBasePosition(startPosition: number, diceValue: number) {
  if (!Number.isInteger(diceValue) || diceValue < 1 || diceValue > 6) {
    throw new Error("diceValue must be an integer between 1 and 6");
  }
  return Math.min(60, Math.max(0, startPosition) + diceValue);
}

export function calculateFinalPosition(basePosition: number, cell: BoardCell) {
  if (cell.type === "setback" || (cell.type === "accelerate" && cell.effect === "move")) {
    return Math.max(0, Math.min(60, basePosition + (cell.value || 0)));
  }
  return basePosition;
}

export function remainingWhenPaused(expiresAt: Date, pausedAt: Date) {
  return Math.max(0, expiresAt.getTime() - pausedAt.getTime());
}

export function expiryAfterResume(resumedAt: Date, remainingMs: number) {
  return new Date(resumedAt.getTime() + Math.max(0, remainingMs));
}
