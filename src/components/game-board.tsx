import { boardCells, boardCoordinates, cellMeta } from "@/lib/board";
import { AvatarPortrait } from "@/components/avatar-portrait";
import { chapterDefinitions } from "@/lib/achievement-catalog";
import type { GameState } from "@/lib/types";

type Player = GameState["players"][number];

function tokensWithOffsets(players: Player[]) {
  const groups = new Map<number, Player[]>();
  for (const player of players) {
    const list = groups.get(player.position) || [];
    list.push(player);
    groups.set(player.position, list);
  }
  return players.map((player) => {
    const group = groups.get(player.position) || [player];
    const index = group.findIndex((item) => item.membershipId === player.membershipId);
    const angle = group.length === 1 ? -Math.PI / 2 : (index / group.length) * Math.PI * 2;
    const radius = group.length === 1 ? 0 : Math.min(28, 12 + group.length * 2);
    return { player, dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
  });
}

function cssPixelOffset(base: string, offset: number) {
  const rounded = Math.abs(offset) < 0.0005 ? 0 : Math.round(offset * 1_000) / 1_000;
  if (rounded === 0) return base;
  const magnitude = Math.abs(rounded).toFixed(3).replace(/\.?0+$/, "");
  return `calc(${base} ${rounded < 0 ? "-" : "+"} ${magnitude}px)`;
}

export function tokenTransform(dx: number, dy: number) {
  return `translate(${cssPixelOffset("-50%", dx)}, ${cssPixelOffset("-72%", dy)})`;
}

export function GameBoard({
  players,
  viewerId,
  cells = boardCells,
  animatedViewerPosition,
}: {
  players: Player[];
  viewerId: string;
  cells?: GameState["boardCells"];
  animatedViewerPosition?: number | null;
}) {
  const path = boardCoordinates.map((point) => `${point.x * 17.92},${point.y * 10.24}`).join(" ");
  return (
    <div className="board-frame">
      {/* Generated specifically for this game; logical cells stay in a precise SVG layer above it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="board-art" src="/assets/golden-savanna-board-chapters.png" alt="Иллюстрированная карта пяти глав игры «Золотая Саванна: Путь к Вершине»" />
      <svg className="board-cells" viewBox="0 0 1792 1024" aria-label="Игровая дорожка из 60 клеток">
        <polyline className="board-route-shadow" points={path} />
        <polyline className="board-route" points={path} />
        {cells.map((cell, index) => {
          const point = boardCoordinates[index];
          const meta = cellMeta[cell.type];
          const x = point.x * 17.92;
          const y = point.y * 10.24;
          return (
            <g key={cell.number} className={`board-cell cell-${cell.type}`} transform={`translate(${x} ${y})`}>
              <title>{`Клетка ${cell.number}: ${meta.label}`}</title>
              <circle r={cell.type === "finish" ? 29 : 23} fill={meta.color} />
              <circle className="cell-ring" r={cell.type === "finish" ? 29 : 23} />
              <text className="cell-number" x="0" y={cell.type === "normal" ? 5 : -2}>{cell.number}</text>
              {cell.type !== "normal" && <text className="cell-icon" x="0" y="15">{meta.icon}</text>}
            </g>
          );
        })}
        {chapterDefinitions.slice(0, 4).map((chapter) => (
          <g
            className="board-chapter-marker"
            key={chapter.shortTitle}
            style={{ "--chapter-color": chapter.color } as React.CSSProperties}
            transform={`translate(${chapter.marker.x} ${chapter.marker.y})`}
          >
            <rect x="-134" y="-28" width="268" height="56" rx="15" />
            <path d="M-112 28 L-90 39 L-78 28 M112 28 L90 39 L78 28" />
            <circle cx="-105" cy="0" r="16" />
            <text className="chapter-roman" x="-105" y="4">{chapter.shortTitle.replace("Глава ", "")}</text>
            <text className="chapter-kicker" x="-78" y="-5">{chapter.shortTitle}</text>
            <text className={`chapter-name ${chapter.title.length > 22 ? "chapter-name-long" : ""}`} x="-78" y="14">{chapter.title}</text>
          </g>
        ))}
      </svg>
      <div className="board-tokens" aria-label="Позиции игроков">
        {tokensWithOffsets(players).map(({ player, dx, dy }) => {
          const shownPosition = player.membershipId === viewerId && animatedViewerPosition != null
            ? animatedViewerPosition
            : player.position;
          const point = boardCoordinates[Math.max(0, Math.min(59, shownPosition === 0 ? 0 : shownPosition - 1))];
          return (
            <div
              key={player.membershipId}
              className={`player-token cosmetic-tier-${player.cosmeticTier} ${player.membershipId === viewerId ? "is-me" : ""}`}
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                transform: tokenTransform(dx, dy),
              } as React.CSSProperties}
              title={`${player.displayName} — клетка ${shownPosition}`}
            >
              {player.cosmeticTier > 0 && <span className="token-trail" />}
              {player.cosmeticTier >= 3 && <span className="token-crown">♛</span>}
              <AvatarPortrait avatarKey={player.avatarKey} title={player.displayName} />
              <small>{player.displayName}</small>
            </div>
          );
        })}
      </div>
      <div className="board-start">СТАРТ</div>
      <div className="board-finish"><small>ФИНАЛ</small>КОРОНАЦИЯ</div>
    </div>
  );
}
