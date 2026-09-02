import { StrictMode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiceOverlay } from "@/components/dice-overlay";
import type { RollOutcome } from "@/lib/game";

const outcome: RollOutcome = {
  diceValue: 4,
  startPosition: 10,
  basePosition: 14,
  finalPosition: 14,
  cellType: "normal",
  effectText: "Спокойный участок пути.",
  rewardTitle: null,
  winnerName: null,
  seasonCompleted: false,
  unlockedAchievements: [],
};

describe("dice overlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => outcome,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("finishes in React Strict Mode instead of spinning forever", async () => {
    const onOutcome = vi.fn();

    render(
      <StrictMode>
        <DiceOverlay onCancel={vi.fn()} onOutcome={onOutcome} />
      </StrictMode>,
    );

    expect(screen.getByRole("status", { name: "Кубик вращается" }).className).toContain("dice-rolling");

    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(3_900);
      await Promise.resolve();
    });

    expect(screen.getByRole("status", { name: "Выпало 4" }).className).toContain("dice-settled");

    await act(async () => {
      vi.advanceTimersByTime(620);
    });

    expect(onOutcome).toHaveBeenCalledOnce();
    expect(onOutcome).toHaveBeenCalledWith(outcome);

    const requests = vi.mocked(fetch).mock.calls;
    expect(requests).toHaveLength(2);
    expect(JSON.parse(String(requests[0]?.[1]?.body)).requestId)
      .toBe(JSON.parse(String(requests[1]?.[1]?.body)).requestId);
  });
});
