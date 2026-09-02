import { describe, expect, it } from "vitest";
import { digestPositionLines } from "@/lib/max-digest-copy";

describe("MAX digest positions", () => {
  it("lists every player with the current cell and marks the leader", () => {
    const lines = digestPositionLines([
      { displayName: "Анна", position: 26 },
      { displayName: "Елена", position: 19 },
      { displayName: "Мария", position: 0 },
    ]);
    expect(lines).toContain("👑 Анна — клетка **26**");
    expect(lines).toContain("🐾 Елена — клетка **19**");
    expect(lines).toContain("🐾 Мария — клетка **0**");
  });
});
