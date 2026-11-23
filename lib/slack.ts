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

/** Mentions are best effort, so a user Slack can't return is left out. */
export async function findSlackUsers(
  client: SlackUsers,
  ids: string[],
): Promise<SlackUser[]> {
  const users = await Promise.all(
    ids.map((id) => slackUser(client, id).catch(() => undefined)),
  );
  return users.filter((u) => u !== undefined);
}

export type SlackMessageLink = { link: string; channel: string; ts: string };

/** Reads a message permalink, such as an emoji reaction trigger's message link. */
export function parseMessageLink(input: string): SlackMessageLink {
  const url = URL.canParse(input) ? new URL(input) : undefined;
  const m = url?.protocol === "https:" &&
      (url.hostname === "slack.com" || url.hostname.endsWith(".slack.com"))
    ? url.pathname.match(/^\/archives\/([A-Z0-9]+)\/p(\d{7,})\/?$/)
    : null;
  if (!m) {
    throw new StepError(`Message "${input}" is not a Slack message link.`);
  }
  return {
    link: input,
    channel: m[1],
    ts: `${m[2].slice(0, -6)}.${m[2].slice(-6)}`,
  };
}

type SlackReply = { ok: boolean; error?: string };

export type SlackConversations = {
  conversations: {
    replies(args: {
      channel: string;
      ts: string;
      oldest: string;
      latest: string;
      inclusive: boolean;
    }): Promise<SlackReply & { messages?: { ts: string; text?: string }[] }>;
    join(args: { channel: string }): Promise<SlackReply>;
  };
};

/** The message's text in Slack markup. Joins a public channel the app isn't in. */
export async function slackMessageText(
  client: SlackConversations,
  { link, channel, ts }: SlackMessageLink,
): Promise<string> {
  const read = () =>
    client.conversations.replies({
      channel,
      ts,
      oldest: ts,
      latest: ts,
      inclusive: true,
    });
  let res = await read();
  if (res.error === "not_in_channel") {
    const joined = await client.conversations.join({ channel });
    if (!joined.ok) {
      throw new StepError(
        `Slack didn't let this app join <#${channel}> to read the message (${joined.error}).`,
      );
    }
    res = await read();
  }
  if (res.error === "channel_not_found") {
    throw new StepError(
      `This app can't see <#${channel}>. In a private channel, add the app first: click the channel's name, then Integrations > Add apps.`,
    );
  }
  if (!res.ok && res.error !== "thread_not_found") {
    throw new StepError(
      `Slack could not read the message (${res.error}): ${link}`,
    );
  }
  const message = res.messages?.find((m) => m.ts === ts);
  if (!message) {
    throw new StepError(
      `Slack has no message at ${link}. It may have been deleted.`,
    );
  }
  return message.text ?? "";
}
