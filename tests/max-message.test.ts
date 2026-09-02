import { describe, expect, it } from "vitest";
import { splitMaxMessage } from "@/lib/max-message";

describe("MAX message splitting", () => {
  it("measures the documented UTF-16 limit without splitting emoji pairs", () => {
    const source = "🦁".repeat(2500);
    const chunks = splitMaxMessage(source, 4000);
    expect(chunks.length).toBe(2);
    expect(chunks.every((chunk) => chunk.length <= 4000)).toBe(true);
    expect(chunks.join("")).toBe(source);
    expect(chunks.every((chunk) => !chunk.includes("�"))).toBe(true);
  });
});
