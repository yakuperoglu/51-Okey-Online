import { getAvatar } from "../social/avatars";

export function AvatarView({
  id,
  size = "md",
  className = "",
}: {
  id?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const a = getAvatar(id);
  return (
    <span className={`avatar-bubble ${size} ${className}`} style={{ background: a.bg }} title={a.label}>
      {a.emoji}
    </span>
  );
}
