import "server-only";

import type { Transaction } from "@libsql/client";
import { boardCells } from "@/lib/board";
import { query } from "@/lib/db";
import type { BoardCell, CellType, ManagedBoardCell } from "@/lib/types";

type Row = Record<string, unknown>;

const cellSelect = `SELECT bc.cell_number, bc.type, bc.title, bc.description, bc.task_achievement_tag, bc.effect,
  bc.move_value, bc.reward_catalog_id, rc.name AS reward_name, rc.value AS reward_value,
  rc.quantity AS reward_quantity, rc.brand_choices_json
  FROM board_cell_configs bc
  LEFT JOIN reward_catalog rc ON rc.id = bc.reward_catalog_id`;

function managedDefault(cell: BoardCell): ManagedBoardCell {
  return {
    ...cell,
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
}

function mergeRow(cell: BoardCell, row?: Row): ManagedBoardCell {
  if (!row) return managedDefault(cell);
  const type = String(row.type) as CellType;
  const value = row.move_value == null ? undefined : Number(row.move_value);
  const effect = row.effect == null ? undefined : String(row.effect) as BoardCell["effect"];
  return {
    number: cell.number,
    type,
    ...(value == null ? {} : { value }),
    ...(effect == null ? {} : { effect }),
    custom: true,
    title: String(row.title || ""),
    description: String(row.description || ""),
    rewardCatalogId: row.reward_catalog_id == null ? null : String(row.reward_catalog_id),
    rewardName: String(row.reward_name || ""),
    rewardValue: Number(row.reward_value || 0),
    rewardQuantity: Number(row.reward_quantity || 1),
    rewardBrandChoices: JSON.parse(String(row.brand_choices_json || "[]")) as string[],
    taskAchievementTag: row.task_achievement_tag == null ? null : String(row.task_achievement_tag) as ManagedBoardCell["taskAchievementTag"],
  };
}

export async function loadRoomBoardCells(roomId: string): Promise<ManagedBoardCell[]> {
  const result = await query(`${cellSelect} WHERE bc.room_id = ?`, [roomId]);
  const rows = new Map(result.rows.map((row) => [Number(row.cell_number), row as Row]));
  return boardCells.map((cell) => mergeRow(cell, rows.get(cell.number)));
}

export async function loadRoomBoardCell(
  tx: Transaction,
  roomId: string,
  cellNumber: number,
): Promise<ManagedBoardCell> {
  const base = boardCells[Math.max(1, Math.min(60, cellNumber)) - 1];
  if (base.number === 60) return managedDefault(base);
  const result = await tx.execute({
    sql: `${cellSelect} WHERE bc.room_id = ? AND bc.cell_number = ? LIMIT 1`,
    args: [roomId, base.number],
  });
  return mergeRow(base, result.rows[0] as Row | undefined);
}

export function publicBoardCells(cells: ManagedBoardCell[]): BoardCell[] {
  return cells.map(({ number, type, value, effect }) => ({
    number,
    type,
    ...(value == null ? {} : { value }),
    ...(effect == null ? {} : { effect }),
  }));
}
