export type DigestPosition = { displayName: string; position: number };

export function digestPositionLines(positions: DigestPosition[]) {
  return [
    "",
    "📍 **Положение прайда на карте:**",
    ...positions.map((player, index) => {
      const marker = index === 0 && player.position > 0 ? "👑" : "🐾";
      return `${marker} ${player.displayName} — клетка **${player.position}**`;
    }),
  ];
}
