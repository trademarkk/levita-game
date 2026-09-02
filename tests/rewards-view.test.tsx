import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameShell } from "@/components/game-shell";
import type { GameState } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("player rewards view", () => {
  it("shows the monetary value of a material reward", () => {
    const state: GameState = {
      generatedAt: "2026-09-02T12:00:00.000Z",
      viewer: {
        userId: "user-1",
        membershipId: "member-1",
        roomId: "room-1",
        displayName: "Анна",
        avatarKey: "lioness-gold",
        branch: null,
        role: "player",
      },
      room: { id: "room-1", name: "Золотая саванна", maxPlayers: 12 },
      season: {
        id: "season-1",
        name: "Первый сезон",
        status: "active",
        endsAt: "2026-10-17T20:59:59.000Z",
        winnerMembershipId: null,
        finalPrize: "Главный приз",
      },
      boardCells: [],
      players: [{
        membershipId: "member-1",
        displayName: "Анна",
        avatarKey: "lioness-gold",
        role: "player",
        position: 20,
        availableRolls: 0,
        nextRollExpiresAt: null,
        blocked: false,
        cosmeticTier: 0,
      }],
      myJourney: { totalSales: 1, achievements: [], nearestAchievementKeys: [], activeRolls: [] },
      myPendingTask: null,
      myRewards: [{
        id: "reward-1",
        name: "Сертификат на маркетплейс",
        value: 500,
        brandChoice: null,
        brandChoices: ["Ozon", "Wildberries"],
        status: "pending",
        grantedAt: "2026-09-02T12:00:00.000Z",
      }],
      events: [],
    };

    render(<GameShell initialState={state} />);
    fireEvent.click(screen.getByRole("button", { name: /Мои сокровища/ }));

    expect(screen.getByRole("heading", { name: "Сертификат на маркетплейс" })).toBeTruthy();
    expect(screen.getByText(/500\s*₽/)).toBeTruthy();
  });
});
