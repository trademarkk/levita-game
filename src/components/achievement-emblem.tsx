"use client";

import {
  Compass,
  Crown,
  Flame,
  Footprints,
  Mountain,
  Shield,
  Sparkles,
  Sun,
  Waves,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AchievementView } from "@/lib/types";

const achievementIcons: Record<string, LucideIcon> = {
  "first-step": Footprints,
  "strong-week": Flame,
  "return-to-savanna": Sun,
  "always-moving": Wind,
  "pride-keeper": Shield,
  "savanna-scout": Compass,
  "golden-trail": Sparkles,
  "royal-strength": Crown,
  "chapter-pride-trail": Sun,
  "chapter-watering-place": Waves,
  "chapter-heir-rock": Mountain,
};

export function AchievementGlyph({ achievement }: { achievement: Pick<AchievementView, "key" | "kind"> }) {
  const Icon = achievementIcons[achievement.key] || (achievement.kind === "chapter" ? Crown : Sparkles);
  return <Icon aria-hidden="true" />;
}

export function AchievementEmblem({
  achievement,
  locked = false,
  compact = false,
}: {
  achievement: Pick<AchievementView, "key" | "kind" | "color" | "title">;
  locked?: boolean;
  compact?: boolean;
}) {
  return (
    <span
      className={`achievement-emblem ${achievement.kind === "chapter" ? "chapter-emblem" : "personal-emblem"} ${locked ? "is-locked" : ""} ${compact ? "is-compact" : ""}`}
      style={{ "--achievement-color": achievement.color } as React.CSSProperties}
      role="img"
      aria-label={achievement.title}
    >
      <i className="emblem-halo" />
      <i className="emblem-laurel emblem-laurel-left" />
      <i className="emblem-laurel emblem-laurel-right" />
      {achievement.kind === "chapter" && <Crown className="emblem-crown" aria-hidden="true" />}
      <span className="emblem-shield"><AchievementGlyph achievement={achievement} /></span>
      <b className="emblem-ribbon">{achievement.kind === "chapter" ? "ГЛАВА" : "ТИТУЛ"}</b>
    </span>
  );
}
