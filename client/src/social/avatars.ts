export interface AvatarDef {
  id: string;
  emoji: string;
  bg: string;
  label: string;
}

export const AVATARS: AvatarDef[] = [
  { id: "fox", emoji: "🦊", bg: "#8a4a22", label: "Tilki" },
  { id: "ladybug", emoji: "🐞", bg: "#7a1f2b", label: "Uğur böceği" },
  { id: "chick", emoji: "🐤", bg: "#b8860b", label: "Civciv" },
  { id: "tiger", emoji: "🐯", bg: "#9a4a12", label: "Kaplan" },
  { id: "frog", emoji: "🐸", bg: "#2f6b32", label: "Kurbağa" },
  { id: "owl", emoji: "🦉", bg: "#4a3728", label: "Baykuş" },
  { id: "wolf", emoji: "🐺", bg: "#4a5568", label: "Kurt" },
  { id: "cat", emoji: "🐱", bg: "#6b5344", label: "Kedi" },
  { id: "lion", emoji: "🦁", bg: "#a16207", label: "Aslan" },
  { id: "panda", emoji: "🐼", bg: "#3f3f46", label: "Panda" },
  { id: "penguin", emoji: "🐧", bg: "#1e3a5f", label: "Penguen" },
  { id: "dragon", emoji: "🐲", bg: "#165c3b", label: "Ejder" },
  { id: "unicorn", emoji: "🦄", bg: "#6d28d9", label: "Unicorn" },
  { id: "robot", emoji: "🤖", bg: "#334155", label: "Robot" },
  { id: "genie", emoji: "🧞", bg: "#1e40af", label: "Cin" },
  { id: "girl", emoji: "👧", bg: "#9d174d", label: "Oyuncu" },
];

export const DEFAULT_AVATAR = "fox";

export function getAvatar(id: string | undefined): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

export function sanitizeAvatarId(id: string | undefined): string {
  return AVATARS.some((a) => a.id === id) ? id! : DEFAULT_AVATAR;
}
