import { StepError } from "./step.ts";

export type SlackUser = { id: string; name: string; email: string | null };

export type SlackUsers = {
  users: {
    info(args: { user: string }): Promise<{
      ok: boolean;
      error?: string;
      user?: { name: string; profile: { real_name?: string; email?: string } };
    }>;
  };
};

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
