import { StepError } from "./step.ts";
import type { CustomField, Member, Project, Ref, Team } from "./shortcut.ts";
import type { SlackUser } from "./slack.ts";
import type { Person } from "./markup.ts";

type Named = { id: string | number; name: string };

export function pickOne<T extends Named>(
  kind: string,
  input: string,
  candidates: T[],
  where: string,
  { aliases = () => [], hint = "" }: {
    aliases?: (c: T) => string[];
    hint?: string;
  } = {},
): T {
  const wanted = input.trim().toLowerCase();
  const matches = candidates.filter((c) =>
    [String(c.id), c.name, ...aliases(c)].some((key) =>
      key.toLowerCase() === wanted
    )
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const labels = matches.map((c) => `${c.name} (${c.id})`).join(", ");
    throw new StepError(
      `${kind} "${input}" matches more than one: ${labels}. Enter the ID instead.`,
    );
  }
  const names = candidates.map((c) => c.name);
  const choices = names.length === 0
    ? "(none)"
    : names.slice(0, 15).join(", ") +
      (names.length > 15 ? `, and ${names.length - 15} more` : "");
  throw new StepError(
    `${kind} "${input}" not found in ${where}. Choose one of: ${choices}.${hint}`,
  );
}

export const teamAliases = (t: Team) =>
  t.mention_name ? [t.mention_name, `@${t.mention_name}`] : [];

export function parseStateInput(
  input: string,
): { workflow?: string; state: string } {
  const at = input.indexOf(" / ");
  if (at === -1) return { state: input };
  return { workflow: input.slice(0, at), state: input.slice(at + 3) };
}

/** v4 rejects a story whose state is outside its project's workflow. */
export function workflowFor(
  named: Ref | undefined,
  project: Project | undefined,
  team: Team | undefined,
  workspaceDefault: Ref,
): Ref {
  const projectWorkflow = project?.workflow;
  if (named && projectWorkflow && named.id !== projectWorkflow.id) {
    throw new StepError(
      `Workflow "${named.name}" doesn't match project "${project.name}", which uses workflow "${projectWorkflow.name}". Leave the workflow out of Workflow state, or choose a state in "${projectWorkflow.name}".`,
    );
  }
  return named ?? projectWorkflow ?? team?.default_workflow ??
    workspaceDefault;
}

/** v4 rejects a story whose team doesn't use the story's workflow. */
export function checkTeamWorkflow(
  team: Team,
  workflow: Ref,
  teamWorkflows: Ref[],
  project: Project | undefined,
): void {
  if (teamWorkflows.some((w) => w.id === workflow.id)) return;
  const names = teamWorkflows.map((w) => `"${w.name}"`).join(", ") ||
    "(none)";
  const fix = project?.workflow
    ? `Choose a project that uses one of them, or another team.`
    : `Choose a state in one of them with "Workflow / State", or another team.`;
  throw new StepError(
    `Team "${team.name}" doesn't use workflow "${workflow.name}". Its workflows are: ${names}. ${fix}`,
  );
}

export function parseStoryRef(input: string, slug: string): number {
  const text = input.trim();
  const number = /^\[?(?:#|sc-)?(\d+)\]?$/i.exec(text);
  if (number) return Number(number[1]);
  const link =
    /^https?:\/\/app\.shortcut\.com\/([^/]+)\/story\/(\d+)(?:[/?#]|$)/i
      .exec(text);
  if (!link) {
    throw new StepError(
      `"${input}" is not a story. Use a story number (123), sc-123, or a story link.`,
    );
  }
  if (link[1].toLowerCase() !== slug.toLowerCase()) {
    throw new StepError(
      `That story link is for workspace "${
        link[1]
      }", but SHORTCUT_API_TOKEN is for "${slug}".`,
    );
  }
  return Number(link[2]);
}

/** The members list leaves out disabled members, so one reads as missing. */
export function memberFor(
  members: Member[],
  user: SlackUser,
  field: "Owner" | "Requester",
): Member {
  if (!user.email) {
    throw new StepError(
      `Slack has no email for <@${user.id}>, so they can't be matched to a Shortcut member. Choose someone else or leave ${field} empty.`,
    );
  }
  const member = findMember(members, user.email);
  if (!member) {
    throw new StepError(
      `No active Shortcut member has ${user.email} (<@${user.id}>) as their profile email. Other emails on a Shortcut account don't match. Change their Shortcut profile email, invite them, or leave ${field} empty.`,
    );
  }
  return member;
}

function findMember(members: Member[], email: string): Member | undefined {
  const wanted = email.toLowerCase();
  return members.find((m) => m.email_address?.toLowerCase() === wanted);
}

export function personFor(user: SlackUser, members: Member[]): Person {
  return {
    name: user.name,
    member: user.email ? findMember(members, user.email) : undefined,
  };
}

export function peopleFor(
  users: SlackUser[],
  members: Member[],
): Map<string, Person> {
  return new Map(users.map((u) => [u.id, personFor(u, members)]));
}

export function priorityValue(
  fields: CustomField[],
  input: string,
): { field_id: string; value_id: string } {
  const field = fields.find((f) =>
    f.enabled && f.canonical_name === "priority"
  );
  if (!field) {
    throw new StepError(
      "This workspace has no Priority field. Turn it on in Shortcut under Settings > Fields, or leave Priority empty.",
    );
  }
  const values = (field.values ?? [])
    .filter((v) => v.enabled)
    .map((v) => ({ id: v.id, name: v.value }));
  const value = pickOne("Priority", input, values, "the Priority field");
  return { field_id: field.id, value_id: value.id };
}
