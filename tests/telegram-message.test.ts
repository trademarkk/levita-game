import { describe, expect, it } from "vitest";
import { splitTelegramMessage, toTelegramHtml } from "@/lib/telegram-message";

describe("Telegram message formatting", () => {
  it("converts shared bold markup to Telegram HTML", () => {
    expect(toTelegramHtml("💛 **Анна** — клетка **44**")).toBe("💛 <b>Анна</b> — клетка <b>44</b>");
  });

  it("escapes user-controlled HTML characters", () => {
    expect(toTelegramHtml("**A&B <test>**")).toBe("<b>A&amp;B &lt;test&gt;</b>");
  });

  it("splits long text below Telegram's limit", () => {
    const chunks = splitTelegramMessage("а".repeat(9), 4);
    expect(chunks).toEqual(["аааа", "аааа", "а"]);
  });
});
