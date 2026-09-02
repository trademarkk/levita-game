import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameBoard, tokenTransform } from "@/components/game-board";
import type { GameState } from "@/lib/types";

const players: GameState["players"] = [
  {
    membershipId: "viewer",
    displayName: "Анна",
    avatarKey: "lioness-sun",
    role: "player",
    position: 0,
    availableRolls: 0,
    nextRollExpiresAt: null,
    blocked: false,
    cosmeticTier: 0,
  },
  {
    membershipId: "second",
    displayName: "Елена",
    avatarKey: "lioness-dawn",
    role: "player",
    position: 0,
    availableRolls: 0,
    nextRollExpiresAt: null,
    blocked: false,
    cosmeticTier: 0,
  },
  {
    membershipId: "third",
    displayName: "Мария",
    avatarKey: "zebra-light",
    role: "player",
    position: 0,
    availableRolls: 0,
    nextRollExpiresAt: null,
    blocked: false,
    cosmeticTier: 0,
  },
];

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("game board hydration", () => {
  it("serializes negative token offsets as stable valid CSS", () => {
    expect(tokenTransform(-9.000000000000007, -15.58845726811989))
      .toBe("translate(calc(-50% - 9px), calc(-72% - 15.588px))");
  });

  it("hydrates overlapping player tokens without a style mismatch", async () => {
    const board = <GameBoard players={players} viewerId="viewer" />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(board);
    document.body.appendChild(container);
    const errors: unknown[][] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => errors.push(args));
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, board);
      await Promise.resolve();
    });

    expect(errors.flat().join(" ")).not.toContain("hydration");
    await act(async () => root?.unmount());
    errorSpy.mockRestore();
  });
});
