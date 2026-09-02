export const avatars = [
  { key: "lioness-crown", name: "Золотой лев", column: 0, row: 0, color: "#bc7728" },
  { key: "lioness-sun", name: "Янтарный рассвет", column: 1, row: 0, color: "#c58b46" },
  { key: "lioness-flame", name: "Мудрый мандрил", column: 2, row: 0, color: "#725039" },
  { key: "lioness-moon", name: "Солнечный жираф", column: 3, row: 0, color: "#d7a247" },
  { key: "lioness-river", name: "Быстрая зебра", column: 0, row: 1, color: "#4e4a43" },
  { key: "lioness-bloom", name: "Добрый кабанчик", column: 1, row: 1, color: "#73513e" },
  { key: "lioness-wind", name: "Серебряный лемур", column: 2, row: 1, color: "#777066" },
  { key: "lioness-star", name: "Зоркий сурикат", column: 3, row: 1, color: "#a77c4b" },
  { key: "lioness-leaf", name: "Слонёнок Тихая сила", column: 0, row: 2, color: "#85837c" },
  { key: "lioness-gem", name: "Птица Золотой клюв", column: 1, row: 2, color: "#c66d25" },
  { key: "lioness-dawn", name: "Весёлая гиена", column: 2, row: 2, color: "#85613f" },
  { key: "lioness-heart", name: "Ловкая обезьянка", column: 3, row: 2, color: "#6c5b4b" },
] as const;

export function getAvatar(key: string) {
  return avatars.find((avatar) => avatar.key === key) || avatars[0];
}
