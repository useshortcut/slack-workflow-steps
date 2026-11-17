// Pure rules that turn what a workflow builder typed into v4 IDs.
// No I/O here: callers fetch the candidate lists, these functions decide.
import { StepError } from "./step.ts";
import type { CustomField, Member, Project, Ref, Team } from "./shortcut.ts";
import type { SlackUser } from "./slack.ts";

type Named = { id: string | number; name: string };

/**
 * The one matching rule for every named thing: team, project, workflow, state,
 * and priority value. The input must equal a candidate's ID, name, or one of
 * its `aliases`, ignoring case. No prefixes and no fuzzy scores, because a
 * step runs unattended for months and a wrong guess files a story in the
 * wrong place without telling anyone.
 */
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

/**
 * "Ready for Dev" names a state in the story's workflow.
 * "Engineering / Ready for Dev" names the workflow too.
 */
export function parseStateInput(
  input: string,
): { workflow?: string; state: string } {
  const at = input.indexOf(" / ");
  if (at === -1) return { state: input };
  return { workflow: input.slice(0, at), state: input.slice(at + 3) };
}

/**
 * The workflow a story's state is looked up in, first match wins:
 *   1. the workflow named in "Workflow / State"
 *   2. the project's workflow, because v4 rejects a state outside it
 *   3. the team's default workflow
 *   4. the workspace's default workflow
 */
export function workflowFor(
  named: Ref | undefined,
  project: Project | undefined,
  team: Team | undefined,
  workspaceDefault: Ref,
): Ref {
  return named ?? project?.workflow ?? team?.default_workflow ??
    workspaceDefault;
}

/**
 * The Shortcut member with the Slack user's email, ignoring case.
 * The members list leaves out disabled members, so one reads as missing.
 */
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
  const email = user.email.toLowerCase();
  const member = members.find((m) => m.email_address?.toLowerCase() === email);
  if (!member) {
    throw new StepError(
      `No active Shortcut member has the email ${user.email} (<@${user.id}>). Invite them to Shortcut or leave ${field} empty.`,
    );
  }
  return member;
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
