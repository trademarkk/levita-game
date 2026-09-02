import { getAvatar } from "@/lib/avatars";

export function AvatarPortrait({
  avatarKey,
  className = "",
  title,
}: {
  avatarKey: string;
  className?: string;
  title?: string;
}) {
  const avatar = getAvatar(avatarKey);
  const x = avatar.column === 0 ? 0 : (avatar.column / 3) * 100;
  const y = avatar.row === 0 ? 0 : (avatar.row / 2) * 100;
  return (
    <span
      className={`avatar-portrait ${className}`.trim()}
      style={{
        "--avatar-color": avatar.color,
        "--avatar-x": `${x}%`,
        "--avatar-y": `${y}%`,
      } as React.CSSProperties}
      role="img"
      aria-label={title || avatar.name}
      title={title || avatar.name}
    />
  );
}
