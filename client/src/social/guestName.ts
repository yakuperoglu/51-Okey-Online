const PREFIX = "misafir";
const DIGITS = 6;

export function randomGuestName(): string {
  const max = 10 ** DIGITS;
  const n = Math.floor(Math.random() * max);
  return `${PREFIX}${String(n).padStart(DIGITS, "0")}`;
}

export function normalizeDisplayName(name: string): string {
  return name.trim().slice(0, 16);
}

export function displayNameKey(name: string): string {
  return normalizeDisplayName(name).toLocaleLowerCase("tr");
}
