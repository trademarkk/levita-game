import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoardCellEditor, boardCellUpdatePayload } from "@/components/board-cell-editor";
import type { ManagedBoardCell } from "@/lib/types";

const cell: ManagedBoardCell = {
  number: 1,
  type: "normal",
  custom: false,
  title: "",
  description: "",
  rewardCatalogId: null,
  rewardName: "",
  rewardValue: 0,
  rewardQuantity: 1,
  rewardBrandChoices: [],
  taskAchievementTag: null,
};

describe("board cell editor", () => {
  afterEach(cleanup);

  it("shows the relevant form immediately after changing the cell role", () => {
    render(<BoardCellEditor cells={[cell]} onUpdated={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Награда$/ }));

    expect(screen.getByRole("heading", { name: "Сокровище" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Название награды" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Награда$/ }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /Задание$/ }));

    expect(screen.getByRole("heading", { name: "Задание" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Название задания" })).toBeTruthy();
  });

  it("sends only fields allowed for the selected role", () => {
    expect(boardCellUpdatePayload(cell)).toEqual({
      action: "update",
      cellNumber: 1,
      type: "normal",
    });

    expect(boardCellUpdatePayload({
      ...cell,
      type: "treasure",
      rewardName: "Сертификат",
      rewardValue: 500,
      rewardQuantity: 12,
      rewardBrandChoices: ["Ozon", "Wildberries"],
    })).toEqual({
      action: "update",
      cellNumber: 1,
      type: "treasure",
      rewardName: "Сертификат",
      rewardValue: 500,
      rewardQuantity: 12,
      rewardBrandChoices: ["Ozon", "Wildberries"],
    });
  });
});
