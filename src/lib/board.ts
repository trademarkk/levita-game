import type { BoardCell, CellType } from "@/lib/types";

const treasureCells = new Set([4, 14, 20, 26, 32, 38, 46, 51, 57]);
const surpriseCells = new Set([9, 17, 24, 35, 43, 50, 58]);
const trapCells = new Set([11, 22, 33, 44, 53]);
const setbacks = new Map([
  [8, -1],
  [19, -2],
  [29, -1],
  [41, -2],
  [52, -1],
]);
const accelerators = new Map<number, Pick<BoardCell, "effect" | "value">>([
  [6, { effect: "move", value: 1 }],
  [27, { effect: "move", value: 2 }],
  [47, { effect: "extra_roll", value: 1 }],
]);

export const boardCells: BoardCell[] = Array.from({ length: 60 }, (_, index) => {
  const number = index + 1;
  if (number === 60) return { number, type: "finish" };
  if (treasureCells.has(number)) return { number, type: "treasure" };
  if (surpriseCells.has(number)) return { number, type: "surprise" };
  if (trapCells.has(number)) return { number, type: "trap" };
  if (setbacks.has(number)) {
    return { number, type: "setback", effect: "move", value: setbacks.get(number) };
  }
  const accelerator = accelerators.get(number);
  if (accelerator) return { number, type: "accelerate", ...accelerator };
  return { number, type: "normal" };
});

export function getBoardCell(number: number) {
  return boardCells[Math.max(1, Math.min(60, number)) - 1];
}

export const cellMeta: Record<
  CellType,
  { label: string; icon: string; color: string; description: string }
> = {
  normal: {
    label: "Тропа",
    icon: "•",
    color: "#fff7dc",
    description: "Спокойный участок пути",
  },
  treasure: {
    label: "Сокровище",
    icon: "✦",
    color: "#f4c84b",
    description: "Случайный подарок из запасов сезона",
  },
  surprise: {
    label: "Событие",
    icon: "?",
    color: "#7bc4d6",
    description: "Скрытая история золотой саванны",
  },
  setback: {
    label: "Препятствие",
    icon: "↓",
    color: "#d56b4b",
    description: "Возвращает на одну или две клетки",
  },
  trap: {
    label: "Задание",
    icon: "!",
    color: "#a76bb5",
    description: "Открывает задание и блокирует следующий ход до его проверки",
  },
  accelerate: {
    label: "Ускорение",
    icon: "↑",
    color: "#75b86b",
    description: "Движение вперёд или дополнительный бросок",
  },
  finish: {
    label: "Вершина",
    icon: "♛",
    color: "#efc85f",
    description: "Финиш сезона",
  },
};

type Point = { x: number; y: number };

// Control points follow the bright road in the generated illustration. Coordinates are percentages.
const waypoints: Point[] = [
  { x: 8, y: 91 },
  { x: 35, y: 87 },
  { x: 86, y: 91 },
  { x: 91, y: 81 },
  { x: 65, y: 75 },
  { x: 18, y: 78 },
  { x: 11, y: 68 },
  { x: 39, y: 60 },
  { x: 84, y: 64 },
  { x: 90, y: 54 },
  { x: 65, y: 47 },
  { x: 22, y: 51 },
  { x: 15, y: 41 },
  { x: 41, y: 32 },
  { x: 79, y: 36 },
  { x: 87, y: 26 },
  { x: 61, y: 20 },
  { x: 30, y: 23 },
  { x: 25, y: 14 },
  { x: 55, y: 9 },
  { x: 87, y: 8 },
];

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function generateBoardCoordinates(count = 60): Point[] {
  const segments = waypoints.slice(0, -1).map((start, index) => {
    const end = waypoints[index + 1];
    return { start, end, length: distance(start, end) };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);

  return Array.from({ length: count }, (_, index) => {
    const target = (index / (count - 1)) * total;
    let covered = 0;
    for (const segment of segments) {
      if (covered + segment.length >= target) {
        const ratio = (target - covered) / segment.length;
        return {
          x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
          y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
        };
      }
      covered += segment.length;
    }
    return waypoints[waypoints.length - 1];
  });
}

export const boardCoordinates = generateBoardCoordinates();

export const surpriseStories = [
  "Стая встречает тебя радостным рыком — весь чат получает повод поддержать лидеров.",
  "Тёплый ветер саванны приносит добрую весть: твой путь замечен командой.",
  "У водопоя собрались друзья. Расскажи в общем чате о маленькой победе дня.",
  "Ты находишь золотое перо. Оно не меняет ход, но остаётся в летописи сезона.",
  "Солнце освещает тропу. Отметь коллегу, чья помощь сегодня была особенно важна.",
  "Сурикаты устроили праздник на дороге — сделай паузу и отпразднуй свой прогресс.",
  "Эхо Вершины повторяет твоё имя. Команда видит, кто продолжает движение.",
];

export function assertBoardDistribution() {
  const counts = boardCells.reduce<Record<CellType, number>>(
    (acc, cell) => {
      acc[cell.type] += 1;
      return acc;
    },
    { normal: 0, treasure: 0, surprise: 0, setback: 0, trap: 0, accelerate: 0, finish: 0 },
  );
  return counts;
}
