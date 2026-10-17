/** Initials shown in the avatar fallback ("Mai Tran" → "MT"). */
export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  const first = parts.at(0);
  const last = parts.length > 1 ? parts.at(-1) : undefined;

  if (first === undefined) {
    return "?";
  }

  const firstLetter = first.charAt(0);
  const secondLetter = last === undefined ? "" : last.charAt(0);

  return `${firstLetter}${secondLetter}`.toUpperCase();
}
