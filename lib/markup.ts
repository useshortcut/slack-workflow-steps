export type Piece =
  | { kind: "text"; text: string }
  | { kind: "user"; id: string; label?: string }
  | { kind: "channel"; id: string; label?: string }
  | { kind: "usergroup"; id: string; label?: string }
  | { kind: "special"; name: string; label?: string }
  | { kind: "link"; url: string; label?: string };

/** A Slack user, and the Shortcut member with the same email if there is one. */
export type Person = {
  name: string;
  member?: { id: string; mention_name: string };
};

const entities: Record<string, string> = { lt: "<", gt: ">", amp: "&" };
const decode = (s: string) =>
  s.replace(/&(lt|gt|amp);/g, (_, name: string) => entities[name]);

/** Finds references the way the Shortcut Slack app's parser does. */
export function parseSlackText(text: string): Piece[] {
  const pieces: Piece[] = [];
  let from = 0;
  for (const match of text.matchAll(/<(.*?)>/g)) {
    const [whole, inner] = match;
    const pipe = inner.indexOf("|");
    const ref = pipe === -1 ? inner : inner.slice(0, pipe);
    if (!ref.trim()) continue;
    const label = pipe === -1 ? "" : inner.slice(pipe + 1);
    if (match.index > from) {
      pieces.push({
        kind: "text",
        text: decode(text.slice(from, match.index)),
      });
    }
    pieces.push(reference(decode(ref), label.trim() ? decode(label) : ""));
    from = match.index + whole.length;
  }
  if (from < text.length) {
    pieces.push({ kind: "text", text: decode(text.slice(from)) });
  }
  return pieces;
}

function reference(ref: string, label: string): Piece {
  const labelled = label ? { label } : {};
  if (ref.startsWith("#C")) {
    return { kind: "channel", id: ref.slice(1), ...labelled };
  }
  if (ref.startsWith("@U") || ref.startsWith("@W")) {
    return { kind: "user", id: ref.slice(1), ...labelled };
  }
  if (ref.startsWith("!subteam^")) {
    return {
      kind: "usergroup",
      id: ref.slice("!subteam^".length),
      ...labelled,
    };
  }
  if (ref.startsWith("!")) {
    return { kind: "special", name: ref.slice(1), ...labelled };
  }
  return { kind: "link", url: ref, ...labelled };
}

export function userIds(pieces: Piece[]): string[] {
  return [
    ...new Set(pieces.flatMap((p) => p.kind === "user" ? [p.id] : [])),
  ];
}

/** Escapes the way the Shortcut Slack app's markdown links do. */
function markdownLink(text: string, url: string): string {
  const label = text.replace(/[!*+<>[\\\]_`\n]/g, "\\$&");
  return `[${label}](${url.replace(/[()<> ]/g, "\\$&")})`;
}

export function toMarkdown(
  pieces: Piece[],
  people: Map<string, Person>,
  teamId: string,
): string {
  return render(pieces, people, teamId, markdownLink);
}

export function toPlainText(
  pieces: Piece[],
  people: Map<string, Person>,
): string {
  return render(pieces, people, "", (text) => text);
}

function render(
  pieces: Piece[],
  people: Map<string, Person>,
  teamId: string,
  link: (text: string, url: string) => string,
): string {
  return pieces.map((p) => {
    switch (p.kind) {
      case "text":
        return p.text;
      case "user": {
        const person = people.get(p.id);
        if (!person) return p.label ?? `<@${p.id}>`;
        const { member } = person;
        return member
          ? link(
            `@${member.mention_name}`,
            `shortcutapp://members/${member.id}`,
          )
          : `@${person.name}`;
      }
      case "channel": {
        const query = new URLSearchParams({ channel: p.id, team: teamId });
        return link(
          p.label ? `#${p.label}` : "Slack channel",
          `https://slack.com/app_redirect?${query}`,
        );
      }
      case "usergroup":
        return p.label ?? "@user group";
      case "special":
        return p.label ?? `@${p.name}`;
      case "link":
        return p.label ? link(p.label, p.url) : p.url;
    }
  }).join("");
}

/** Titles a story the way the Shortcut Slack app's story modal does. */
export function storyTitle(plain: string): string {
  const line = plain.split("\n").find((l) => l.trim()) ?? "";
  const end = line.indexOf(". ");
  return (end === -1 ? line : line.slice(0, end)).trim().slice(0, 512);
}
