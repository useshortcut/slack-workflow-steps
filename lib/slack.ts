import { StepError } from "./step.ts";

/** `email` is null for bots and for users whose email Slack doesn't share. */
export type SlackUser = { id: string; name: string; email: string | null };

/** The part of Slack's API client this app uses. */
export type SlackUsers = {
  users: {
    info(args: { user: string }): Promise<{
      ok: boolean;
      error?: string;
      user?: { name: string; profile: { real_name?: string; email?: string } };
    }>;
  };
};

/** Reads a Slack user's name and email (bot scopes users:read, users:read.email). */
export async function slackUser(
  client: SlackUsers,
  id: string,
): Promise<SlackUser> {
  const res = await client.users.info({ user: id });
  if (!res.ok || !res.user) {
    throw new StepError(`Slack could not look up <@${id}> (${res.error}).`);
  }
  return {
    id,
    name: res.user.profile.real_name || res.user.name,
    email: res.user.profile.email ?? null,
  };
}
