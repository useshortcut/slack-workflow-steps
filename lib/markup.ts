/** Titles a story the way the Shortcut Slack app's story modal does. */
export function storyTitle(plain: string): string {
  const line = plain.split("\n").find((l) => l.trim()) ?? "";
  const end = line.indexOf(". ");
  return (end === -1 ? line : line.slice(0, end)).trim().slice(0, 512);
}
