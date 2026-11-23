import { assertEquals } from "@std/assert";
import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import createStory, { CreateStory } from "../functions/create_story.ts";
import { fakeShortcut, type FakeWorkspace } from "./fake_shortcut.ts";
import {
  acme,
  env,
  HIGH,
  INFRA,
  JO,
  PLATFORM_A,
  PLATFORM_B,
  PRIORITY,
  SAM,
} from "./fixtures.ts";

const { createContext } = SlackFunctionTester(CreateStory);
type Inputs = Parameters<typeof createContext>[0]["inputs"];

async function run(
  inputs: Inputs,
  ws: FakeWorkspace = acme,
  runEnv: Record<string, string> = env,
) {
  using shortcut = await fakeShortcut(ws);
  const result = await createStory(createContext({ inputs, env: runEnv }));
  const posts = shortcut.sent.filter((r) => r.method === "POST");
  return { result, sent: shortcut.sent, body: posts[0]?.body, posts };
}

const created = {
  outputs: {
    story_id: 123,
    story_url: "https://app.shortcut.com/acme/story/123",
  },
};

Deno.test("a title alone makes two requests and uses the workspace default state", async () => {
  const { result, sent } = await run({ title: "Login fails" });
  assertEquals(sent, [
    { method: "GET", path: "/whoami" },
    {
      method: "POST",
      path: "/stories",
      body: { name: "Login fails", workflow_state_id: 500 },
    },
  ]);
  assertEquals(result, created);
});

Deno.test("blank optional inputs are ignored", async () => {
  const { sent } = await run({
    title: "  Login fails ",
    description: " ",
    team: "",
    project: "  ",
    workflow_state: " ",
    priority: "",
  });
  assertEquals(sent.map((r) => r.path), ["/whoami", "/stories"]);
  assertEquals(sent[1].body, { name: "Login fails", workflow_state_id: 500 });
});

Deno.test("the title is cut to 512 characters", async () => {
  const { body } = await run({ title: "x".repeat(600) });
  assertEquals(body, { name: "x".repeat(512), workflow_state_id: 500 });
});

Deno.test("the title is the first sentence of the first line", async () => {
  const { body } = await run({
    title:
      "\nLogin fails on Safari. It hangs after the password step.\nSeen twice",
  });
  assertEquals(body, { name: "Login fails on Safari", workflow_state_id: 500 });
});

Deno.test("a title with nothing before its first sentence end is refused before posting", async () => {
  const { result, sent } = await run({ title: ". Login fails" });
  assertEquals(result, { error: "Title is empty." });
  assertEquals(sent.map((r) => r.path), ["/whoami"]);
});

Deno.test("Slack mentions and links become Shortcut text", async () => {
  using shortcut = await fakeShortcut(acme);
  await createStory(createContext({
    inputs: {
      title: "<@U_JO> can't log in. <@U_SAM> saw it too",
      description:
        "From <@U_JO> in <#C42|support>, cc <@U_PAT> <@U_BOT> <@U_GONE> <@U_JO>: <https://status.acme.com|status> &amp; logs",
    },
    env,
    team_id: "T_ACME",
  }));
  assertEquals(shortcut.sent.at(-1)?.body, {
    name: "@jo_park can't log in",
    workflow_state_id: 500,
    description:
      `From [@jo\\_park](shortcutapp://members/${JO}) in [#support](https://slack.com/app_redirect?channel=C42&team=T_ACME), cc @Pat Kim @Deploy Bot <@U_GONE> [@jo\\_park](shortcutapp://members/${JO}): [status](https://status.acme.com) & logs`,
  });
  assertEquals(shortcut.slackLookups.sort(), [
    "U_BOT",
    "U_GONE",
    "U_JO",
    "U_PAT",
    "U_SAM",
  ]);
});

const permalink =
  "https://acme.slack.com/archives/C42/p1700000000000100?thread_ts=1700000000.000100&cid=C42";

Deno.test("Source link adds a line linking the Slack message", async () => {
  const { body } = await run({
    title: "t",
    description: "Seen on Safari",
    source_url: ` ${permalink} `,
  });
  assertEquals(body, {
    name: "t",
    workflow_state_id: 500,
    description:
      `Seen on Safari\n\n*Created in Slack from [this message](${permalink}).*`,
  });
});

Deno.test("Source link without a description is the whole description", async () => {
  const { body } = await run({ title: "t", source_url: permalink });
  assertEquals(body, {
    name: "t",
    workflow_state_id: 500,
    description: `*Created in Slack from [this message](${permalink}).*`,
  });
});

Deno.test("a Source link that isn't an https link is refused before any request", async () => {
  for (const source_url of ["see thread", "http://acme.slack.com/x", "C42"]) {
    const { result, sent } = await run({ title: "t", source_url });
    assertEquals(result, {
      error: `Source link "${source_url}" is not a link.`,
    });
    assertEquals(sent, []);
  }
});

Deno.test("text without mentions doesn't list members", async () => {
  const { sent } = await run({
    title: "Login fails",
    description: "See <https://status.acme.com>",
  });
  assertEquals(sent.map((r) => r.path), ["/whoami", "/stories"]);
});

Deno.test("description and type are sent as given", async () => {
  const { body } = await run({
    title: "Login fails",
    description: "Steps:\n1. Log in",
    story_type: "bug",
  });
  assertEquals(body, {
    name: "Login fails",
    workflow_state_id: 500,
    description: "Steps:\n1. Log in",
    story_type: "bug",
  });
});

Deno.test("a team starts the story in its default workflow's default state", async () => {
  for (const team of ["Infra", "infra", "@infra", INFRA]) {
    const { body } = await run({ title: "t", team });
    assertEquals(body, { name: "t", workflow_state_id: 700, team_id: INFRA });
  }
});

Deno.test("a state is looked up in the team's workflow", async () => {
  const { body, sent } = await run({
    title: "t",
    team: "Infra",
    workflow_state: "ready for dev",
  });
  assertEquals(body, { name: "t", workflow_state_id: 701, team_id: INFRA });
  assertEquals(sent.map((r) => r.path), [
    "/whoami",
    "/teams?limit=100",
    "/teams?cursor=2",
    `/teams/${INFRA}/workflows?limit=100`,
    "/workflows/3/states?limit=100",
    "/workflows/3/states?cursor=2",
    "/stories",
  ]);
});

Deno.test("a state without a team is looked up in the default workflow", async () => {
  const { body } = await run({ title: "t", workflow_state: "In Progress" });
  assertEquals(body, { name: "t", workflow_state_id: 502 });
});

Deno.test('"Workflow / State" picks the workflow', async () => {
  const { body } = await run({
    title: "t",
    team: "Infra",
    workflow_state: "Design / Ready for Review",
  });
  assertEquals(body, { name: "t", workflow_state_id: 601, team_id: INFRA });
});

Deno.test("a project's workflow wins over the team's", async () => {
  const { body } = await run({
    title: "t",
    team: "Infra",
    project: "website",
    workflow_state: "Done",
  });
  assertEquals(body, {
    name: "t",
    workflow_state_id: 602,
    team_id: INFRA,
    project_id: 10,
  });
});

Deno.test("a named workflow that isn't the project's is refused before posting", async () => {
  const { result, posts } = await run({
    title: "t",
    project: "Billing",
    workflow_state: "Design / Ready for Review",
  });
  assertEquals(result, {
    error:
      'Workflow "Design" doesn\'t match project "Billing", which uses workflow "Engineering". Leave the workflow out of Workflow state, or choose a state in "Engineering".',
  });
  assertEquals(posts, []);
});

Deno.test("a named workflow the team doesn't use is refused before posting", async () => {
  const { result, posts } = await run({
    title: "t",
    team: "Infra",
    workflow_state: "Engineering / Ready for Dev",
  });
  assertEquals(result, {
    error:
      'Team "Infra" doesn\'t use workflow "Engineering". Its workflows are: "Infrastructure", "Design". Choose a state in one of them with "Workflow / State", or another team.',
  });
  assertEquals(posts, []);
});

Deno.test("a project whose workflow the team doesn't use is refused before posting", async () => {
  const { result, posts } = await run({
    title: "t",
    team: "Infra",
    project: "Billing",
  });
  assertEquals(result, {
    error:
      'Team "Infra" doesn\'t use workflow "Engineering". Its workflows are: "Infrastructure", "Design". Choose a project that uses one of them, or another team.',
  });
  assertEquals(posts, []);
});

Deno.test("every page of the team's workflows is checked", async () => {
  const teams = [{
    id: INFRA,
    name: "Infra",
    workflow: 3,
    workflows: [3, 1, 2],
  }];
  const { body, sent } = await run({
    title: "t",
    team: "Infra",
    workflow_state: "Design / Backlog",
  }, { ...acme, teams });
  assertEquals(body, { name: "t", workflow_state_id: 600, team_id: INFRA });
  assertEquals(
    sent.filter((r) => r.path.startsWith(`/teams/${INFRA}`)).map((r) => r.path),
    [
      `/teams/${INFRA}/workflows?limit=100`,
      `/teams/${INFRA}/workflows?cursor=2`,
    ],
  );
});

Deno.test("a project is matched by ID", async () => {
  const { body } = await run({ title: "t", project: "12" });
  assertEquals(body, { name: "t", workflow_state_id: 500, project_id: 12 });
});

Deno.test("a state outside the workflow names the workflow and the way out", async () => {
  const { result, posts } = await run({
    title: "t",
    workflow_state: "Backlog",
  });
  assertEquals(result, {
    error:
      'State "Backlog" not found in workflow "Engineering". Choose one of: Unstarted, Ready for Dev, In Progress, Done. To use another workflow, enter "Workflow / State".',
  });
  assertEquals(posts, []);
});

Deno.test("an unknown team lists the teams", async () => {
  const { result, posts } = await run({ title: "t", team: "Mobile" });
  assertEquals(result, {
    error:
      'Team "Mobile" not found in Shortcut workspace "Acme". Choose one of: Infra, Web, Platform, Platform.',
  });
  assertEquals(posts, []);
});

Deno.test("an ambiguous team lists the matches with their IDs", async () => {
  const { result, posts } = await run({ title: "t", team: "Platform" });
  assertEquals(result, {
    error:
      `Team "Platform" matches more than one: Platform (${PLATFORM_A}), Platform (${PLATFORM_B}). Enter the ID instead.`,
  });
  assertEquals(posts, []);
});

Deno.test("an unknown workflow lists the workflows", async () => {
  const { result } = await run({ title: "t", workflow_state: "Ops / Done" });
  assertEquals(result, {
    error:
      'Workflow "Ops" not found in Shortcut workspace "Acme". Choose one of: Engineering, Design, Infrastructure.',
  });
});

Deno.test("a long list of choices stops at 15 names", async () => {
  const projects = Array.from(
    { length: 17 },
    (_, i) => ({ id: 100 + i, name: `P${i + 1}` }),
  );
  const { result } = await run({ title: "t", project: "Nope" }, {
    ...acme,
    projects,
  });
  assertEquals(result, {
    error:
      'Project "Nope" not found in Shortcut workspace "Acme". Choose one of: P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11, P12, P13, P14, P15, and 2 more.',
  });
});

Deno.test("priority sets the Priority field's value", async () => {
  const { body } = await run({ title: "t", priority: "high" });
  assertEquals(body, {
    name: "t",
    workflow_state_id: 500,
    custom_field_values: [{ field_id: PRIORITY, value_id: HIGH }],
  });
});

Deno.test("a disabled priority value is not a choice", async () => {
  const { result, posts } = await run({ title: "t", priority: "Urgent" });
  assertEquals(result, {
    error:
      'Priority "Urgent" not found in the Priority field. Choose one of: Highest, High, Medium, Low.',
  });
  assertEquals(posts, []);
});

Deno.test("a workspace without an enabled Priority field says so", async () => {
  const fields = acme.customFields?.map((f) => ({ ...f, enabled: false }));
  const { result } = await run({ title: "t", priority: "High" }, {
    ...acme,
    customFields: fields,
  });
  assertEquals(result, {
    error:
      "This workspace has no Priority field. Turn it on in Shortcut under Settings > Fields, or leave Priority empty.",
  });
});

Deno.test("owner and requester are matched by email, ignoring case", async () => {
  const { body } = await run({
    title: "t",
    owner: "U_JO",
    requester: "U_SAM",
  });
  assertEquals(body, {
    name: "t",
    workflow_state_id: 500,
    owner_ids: [JO],
    requester_id: SAM,
  });
});

Deno.test("an owner who isn't a Shortcut member is refused", async () => {
  const { result, posts } = await run({ title: "t", owner: "U_PAT" });
  assertEquals(result, {
    error:
      "No active Shortcut member has pat@elsewhere.com (<@U_PAT>) as their profile email. Other emails on a Shortcut account don't match. Change their Shortcut profile email, invite them, or leave Owner empty.",
  });
  assertEquals(posts, []);
});

Deno.test("a requester Slack has no email for is refused", async () => {
  const { result, posts } = await run({ title: "t", requester: "U_BOT" });
  assertEquals(result, {
    error:
      "Slack has no email for <@U_BOT>, so they can't be matched to a Shortcut member. Choose someone else or leave Requester empty.",
  });
  assertEquals(posts, []);
});

Deno.test("a Slack user lookup that fails names the user", async () => {
  const { result } = await run({ title: "t", owner: "U_GONE" });
  assertEquals(result, {
    error: "Slack could not look up <@U_GONE> (user_not_found).",
  });
});

Deno.test("every input together makes one story", async () => {
  const { result, body } = await run({
    title: "Login fails",
    description: "On Safari",
    story_type: "bug",
    team: "Infra",
    project: "Website",
    workflow_state: "Ready for Review",
    priority: "High",
    owner: "U_JO",
    requester: "U_SAM",
  });
  assertEquals(body, {
    name: "Login fails",
    workflow_state_id: 601,
    description: "On Safari",
    story_type: "bug",
    team_id: INFRA,
    project_id: 10,
    owner_ids: [JO],
    requester_id: SAM,
    custom_field_values: [{ field_id: PRIORITY, value_id: HIGH }],
  });
  assertEquals(result, created);
});

Deno.test("a missing token is refused before any request", async () => {
  const { result, sent } = await run({ title: "t" }, acme, {});
  assertEquals(result, {
    error:
      "SHORTCUT_API_TOKEN is not set. Run: slack env add SHORTCUT_API_TOKEN <token>",
  });
  assertEquals(sent, []);
});

Deno.test("a token that isn't v4 is refused before any request", async () => {
  const { result, sent } = await run({ title: "t" }, acme, {
    SHORTCUT_API_TOKEN: "a1b2c3",
  });
  assertEquals(result, {
    error:
      'SHORTCUT_API_TOKEN is not a Shortcut v4 token (it should start with "sct_"). Create one in Shortcut under Settings > API Tokens.',
  });
  assertEquals(sent, []);
});

Deno.test("a token that can read but not write stories is refused after /whoami", async () => {
  const { result, sent } = await run({ title: "t" }, {
    ...acme,
    scopes: ["read", "comment-write"],
  });
  assertEquals(result, {
    error:
      'The Shortcut token has scopes: read, comment-write. This step needs a token with the scopes "read", plus "write" or "story-write". Create one and run: slack env add SHORTCUT_API_TOKEN <token>',
  });
  assertEquals(sent.map((r) => r.path), ["/whoami"]);
});

Deno.test("an Observer's token is refused after /whoami", async () => {
  const { result, sent } = await run({ title: "t" }, {
    ...acme,
    tokenRole: "observer",
  });
  assertEquals(result, {
    error:
      "SHORTCUT_API_TOKEN belongs to Alex Doe (@alex), an Observer. Observers can't create stories or comments. Use a token from a Member, Admin, or Owner.",
  });
  assertEquals(sent.map((r) => r.path), ["/whoami"]);
});

Deno.test("a Member, Admin, or Owner's token can create stories", async () => {
  for (const role of ["member", "admin", "owner"]) {
    const { result } = await run({ title: "t" }, { ...acme, tokenRole: role });
    assertEquals(result, created, role);
  }
});

Deno.test("a token without read is refused at /whoami", async () => {
  const { result, sent } = await run({ title: "t" }, {
    ...acme,
    failures: { "GET /whoami": 403 },
  });
  assertEquals(result, {
    error:
      'Shortcut refused SHORTCUT_API_TOKEN (403). This step needs a token with the scopes "read", plus "write" or "story-write". Create one and run: slack env add SHORTCUT_API_TOKEN <token>',
  });
  assertEquals(sent.map((r) => r.path), ["/whoami"]);
});

Deno.test("write or story-write can create stories", async () => {
  for (const scopes of [["read", "write"], ["read", "story-write"]]) {
    const { result } = await run({ title: "t", team: "Infra" }, {
      ...acme,
      scopes,
    });
    assertEquals(result, created, scopes.join());
  }
});

Deno.test("a rejected token says so", async () => {
  const { result } = await run({ title: "t" }, {
    ...acme,
    failures: { "GET /whoami": 401 },
  });
  assertEquals(result, {
    error:
      "Shortcut rejected SHORTCUT_API_TOKEN (401). It may be revoked or for another workspace.",
  });
});

Deno.test("the rate limit says to wait", async () => {
  const { result } = await run({ title: "t", team: "Infra" }, {
    ...acme,
    failures: { "GET /teams?cursor=2": 429 },
  });
  assertEquals(result, {
    error:
      "Shortcut rate limit reached (200 requests per minute per token). Wait a minute and rerun the workflow.",
  });
});

Deno.test("an outage during lookups says to rerun later", async () => {
  const { result, posts } = await run({ title: "t", team: "Infra" }, {
    ...acme,
    failures: { "GET /teams?limit=100": 503 },
  });
  assertEquals(result, {
    error: "Shortcut is unavailable (503). Rerun the workflow later.",
  });
  assertEquals(posts, []);
});

Deno.test("an unconfirmed story warns that it may exist", async () => {
  for (const failure of [503, "network"] as const) {
    const { result } = await run({ title: "t" }, {
      ...acme,
      failures: { "POST /stories": failure },
    });
    const detail = failure === 503 ? "503" : "network error";
    assertEquals(result, {
      error:
        `Shortcut did not confirm the story (${detail}). It may have been created anyway. Check Shortcut before you run the workflow again.`,
    });
  }
});

Deno.test("a story Shortcut rejects shows Shortcut's reply", async () => {
  const { result } = await run({ title: "t" }, {
    ...acme,
    failures: { "POST /stories": 422 },
  });
  assertEquals(result, { error: "Shortcut rejected the story (422): {}" });
});

const reacted = "https://acme.slack.com/archives/C0SUPPORT/p1700000000000100";

Deno.test("Message alone fills Title, Description, and Source link from the Slack message", async () => {
  using shortcut = await fakeShortcut(acme);
  const result = await createStory(createContext({
    inputs: { message: reacted },
    env,
    team_id: "T_ACME",
  }));
  assertEquals(result, created);
  assertEquals(shortcut.sent.at(-1)?.body, {
    name: "Login fails for @jo_park",
    workflow_state_id: 500,
    description:
      `Login fails for [@jo\\_park](shortcutapp://members/${JO}). See [status](https://status.acme.com)\nIt hangs & times out\n\n*Created in Slack from [this message](${reacted}).*`,
  });
  assertEquals(shortcut.slackCalls, ["conversations.replies C0SUPPORT"]);
});

Deno.test("Title and Description override the message's text", async () => {
  const { body } = await run({
    title: "Login bug",
    description: "Seen twice",
    message: reacted,
  });
  assertEquals(body, {
    name: "Login bug",
    workflow_state_id: 500,
    description:
      `Seen twice\n\n*Created in Slack from [this message](${reacted}).*`,
  });
});

Deno.test("Title and Description set don't read the message", async () => {
  using shortcut = await fakeShortcut(acme);
  await createStory(createContext({
    inputs: { title: "t", description: "d", message: reacted },
    env,
  }));
  assertEquals(shortcut.slackCalls, []);
});

Deno.test("Message fills only the inputs left empty", async () => {
  const { body } = await run({ title: "Login bug", message: reacted });
  assertEquals(
    (body as { name: string }).name,
    "Login bug",
  );
  const withDescription = await run({
    description: "Seen twice",
    message: reacted,
  });
  assertEquals(
    (withDescription.body as { name: string }).name,
    "Login fails for @jo_park",
  );
});

Deno.test("Source link replaces the message link in the footer", async () => {
  const { body } = await run({
    title: "t",
    description: "d",
    message: reacted,
    source_url: "https://acme.com/ticket/9",
  });
  assertEquals(
    (body as { description: string }).description,
    "d\n\n*Created in Slack from [this message](https://acme.com/ticket/9).*",
  );
});

Deno.test("a thread reply's link reads the reply", async () => {
  const { body } = await run({
    message:
      "https://acme.slack.com/archives/C0SUPPORT/p1700000000000200?thread_ts=1700000000.000100&cid=C0SUPPORT",
  });
  assertEquals((body as { name: string }).name, "Same on Safari");
});

Deno.test("the app joins a public channel it isn't in, then reads the message", async () => {
  using shortcut = await fakeShortcut(acme);
  const result = await createStory(createContext({
    inputs: {
      message: "https://acme.slack.com/archives/C0RANDOM/p1700000001000100",
    },
    env,
  }));
  assertEquals(result, created);
  assertEquals(shortcut.slackCalls, [
    "conversations.replies C0RANDOM",
    "conversations.join C0RANDOM",
    "conversations.replies C0RANDOM",
  ]);
});

Deno.test("a private channel without the app is refused before posting", async () => {
  const { result, posts } = await run({
    message: "https://acme.slack.com/archives/G0SECRET/p1700000002000100",
  });
  assertEquals(result, {
    error:
      "This app can't see <#G0SECRET>. In a private channel, add the app first: click the channel's name, then Integrations > Add apps.",
  });
  assertEquals(posts, []);
});

Deno.test("a deleted message is refused before posting", async () => {
  const link = "https://acme.slack.com/archives/C0SUPPORT/p1700000000000999";
  const { result, posts } = await run({ message: link });
  assertEquals(result, {
    error: `Slack has no message at ${link}. It may have been deleted.`,
  });
  assertEquals(posts, []);
});

Deno.test("a message without text needs a Title", async () => {
  const { result, posts } = await run({
    message: "https://acme.slack.com/archives/C0SUPPORT/p1700000000000300",
  });
  assertEquals(result, { error: "The message has no text. Set Title." });
  assertEquals(posts, []);
});

Deno.test("neither Title nor Message is refused before any request", async () => {
  for (
    const inputs of [{}, { title: " ", message: "" }, { description: "d" }]
  ) {
    const { result, sent } = await run(inputs);
    assertEquals(result, { error: "Set Title or Message." });
    assertEquals(sent, []);
  }
});

Deno.test("a Message that isn't a Slack message link is refused before any request", async () => {
  for (
    const message of [
      "Login fails",
      "https://acme.com/archives/C0SUPPORT/p1700000000000100",
      "https://acme.slack.com/archives/C0SUPPORT",
      "http://acme.slack.com/archives/C0SUPPORT/p1700000000000100",
    ]
  ) {
    const { result, sent } = await run({ message });
    assertEquals(result, {
      error: `Message "${message}" is not a Slack message link.`,
    });
    assertEquals(sent, []);
  }
});
