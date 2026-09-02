import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebglEventCinematic } from "@/components/webgl-event-cinematic";
import type { RollOutcome } from "@/lib/game";

afterEach(cleanup);

describe("task cinematic", () => {
  it("shows the task title and full instructions next to the scroll", () => {
    const outcome: RollOutcome = {
      diceValue: 4,
      startPosition: 40,
      basePosition: 44,
      finalPosition: 44,
      cellType: "trap",
      effectText: "Задание «Голос клиента»\nПолучи честный положительный отзыв клиента на Яндекс Картах / 2ГИС / Google Картах.\nСледующий ход закрыт до проверки руководителем.",
      rewardTitle: null,
      winnerName: null,
      seasonCompleted: false,
      unlockedAchievements: [],
    };

    render(<WebglEventCinematic outcome={outcome} onContinue={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Голос клиента" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Голос клиента" })).toBeTruthy();
    expect(screen.getByText(/Получи честный положительный отзыв клиента/)).toBeTruthy();
    expect(screen.getByText(/Следующий ход закрыт/)).toBeTruthy();
  });

  it("shows the material reward amount next to the opened chest", () => {
    const outcome: RollOutcome = {
      diceValue: 5,
      startPosition: 15,
      basePosition: 20,
      finalPosition: 20,
      cellType: "treasure",
      effectText: "Сокровище открыто: Сертификат на маркетплейс — 500 ₽.",
      rewardTitle: "Сертификат на маркетплейс",
      rewardValue: 500,
      winnerName: null,
      seasonCompleted: false,
      unlockedAchievements: [],
    };

    render(<WebglEventCinematic outcome={outcome} onContinue={vi.fn()} />);

    expect(screen.getByText(/Сертификат на маркетплейс · 500\s*₽/)).toBeTruthy();
  });
});
