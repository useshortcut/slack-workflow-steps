import { assertEquals } from "@std/assert";
import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import addComment, { AddComment } from "../functions/add_comment.ts";
import { fakeShortcut, type FakeWorkspace } from "./fake_shortcut.ts";
import { acme, env, JO } from "./fixtures.ts";

const { createContext } = SlackFunctionTester(AddComment);
type Inputs = Parameters<typeof createContext>[0]["inputs"];

async function run(inputs: Inputs, ws: FakeWorkspace = acme) {
  using shortcut = await fakeShortcut(ws);
  const result = await addComment(createContext({ inputs, env }));
  return { result, sent: shortcut.sent };
}

Deno.test("every story reference form posts to that story", async () => {
  const refs = [
    "123",
    " 123 ",
    "#123",
    "sc-123",
    "SC-123",
    "[sc-123]",
    "https://app.shortcut.com/acme/story/123",
    "https://app.shortcut.com/acme/story/123/login-fails",
    "https://app.shortcut.com/acme/story/123/login-fails?foo=1#activity-9",
  ];
  for (const story of refs) {
    const { result, sent } = await run({ story, comment: "Seen again" });
    assertEquals(sent, [
      { method: "GET", path: "/whoami" },
      {
        method: "POST",
        path: "/stories/123/comments",
        body: { text: "Seen again" },
      },
    ], story);
    assertEquals(result, {
      outputs: {
        comment_url: "https://app.shortcut.com/acme/story/123#activity-9",
      },
    });
  }
});

Deno.test("Posted by mentions the Shortcut member with the person's email", async () => {
  const { sent } = await run({
    story: "123",
    comment: "Customer confirmed the fix",
    posted_by: "U_JO",
  });
  assertEquals(sent.at(-1)?.body, {
    text:
      `Customer confirmed the fix\n\n_Posted from Slack by [@jo\\_park](shortcutapp://members/${JO})_`,
  });
});

Deno.test("Posted by without a Shortcut member uses the Slack name", async () => {
  for (
    const [posted_by, name] of [["U_PAT", "Pat Kim"], ["U_BOT", "Deploy Bot"]]
  ) {
    const { result, sent } = await run({
      story: "123",
      comment: "c",
      posted_by,
    });
    assertEquals(sent.at(-1)?.body, {
      text: `c\n\n_Posted from Slack by ${name}_`,
    });
    assertEquals(result, {
      outputs: {
        comment_url: "https://app.shortcut.com/acme/story/123#activity-9",
      },
    });
  }
});

Deno.test("Slack mentions in the comment become Shortcut mentions", async () => {
  const { result, sent } = await run({
    story: "123",
    comment: "Fixed for <@U_JO>, thanks <@U_GONE> &amp; <!here>",
  });
  assertEquals(sent.at(-1)?.body, {
    text:
      `Fixed for [@jo\\_park](shortcutapp://members/${JO}), thanks <@U_GONE> & @here`,
  });
  assertEquals(result, {
    outputs: {
      comment_url: "https://app.shortcut.com/acme/story/123#activity-9",
    },
  });
});

Deno.test("Posted by and Source link each add a line, Posted by first", async () => {
  const permalink = "https://acme.slack.com/archives/C42/p1700000000000100";
  const { sent } = await run({
    story: "123",
    comment: "Seen again",
    posted_by: "U_PAT",
    source_url: permalink,
  });
  assertEquals(sent.at(-1)?.body, {
    text:
      `Seen again\n\n_Posted from Slack by Pat Kim_\n\n*Created in Slack from [this message](${permalink}).*`,
  });
});

Deno.test("a Source link that isn't a link is refused before any request", async () => {
  const { result, sent } = await run({
    story: "123",
    comment: "c",
    source_url: "thread",
  });
  assertEquals(result, { error: 'Source link "thread" is not a link.' });
  assertEquals(sent, []);
});

Deno.test("a link to another workspace is refused before posting", async () => {
  const { result, sent } = await run({
    story: "https://app.shortcut.com/other/story/123/login-fails",
    comment: "c",
  });
  assertEquals(result, {
    error:
      'That story link is for workspace "other", but SHORTCUT_API_TOKEN is for "acme".',
  });
  assertEquals(sent.map((r) => r.path), ["/whoami"]);
});

Deno.test("text that isn't a story reference is refused before posting", async () => {
  for (const story of ["abc", "sc-", "https://app.shortcut.com/acme/epic/5"]) {
    const { result, sent } = await run({ story, comment: "c" });
    assertEquals(result, {
      error:
        `"${story}" is not a story. Use a story number (123), sc-123, or a story link.`,
    });
    assertEquals(sent.map((r) => r.path), ["/whoami"]);
  }
});

Deno.test("an empty comment is refused before any request", async () => {
  const { result, sent } = await run({ story: "123", comment: "  " });
  assertEquals(result, { error: "Comment is empty." });
  assertEquals(sent, []);
});

Deno.test("a story that doesn't exist says so", async () => {
  const { result } = await run({ story: "999", comment: "c" }, {
    ...acme,
    failures: { "POST /stories/999/comments": 404 },
  });
  assertEquals(result, {
    error: 'Story 999 not found in Shortcut workspace "Acme".',
  });
});

Deno.test("an unconfirmed comment warns that it may exist", async () => {
  const { result } = await run({ story: "123", comment: "c" }, {
    ...acme,
    failures: { "POST /stories/123/comments": 502 },
  });
  assertEquals(result, {
    error:
      "Shortcut did not confirm the comment (502). It may have been created anyway. Check Shortcut before you run the workflow again.",
  });
});

Deno.test("commenting needs write or comment-write", async () => {
  for (const scopes of [["read", "comment-write"], ["read", "write"]]) {
    const { result } = await run({ story: "123", comment: "c" }, {
      ...acme,
      scopes,
    });
    assertEquals(result, {
      outputs: {
        comment_url: "https://app.shortcut.com/acme/story/123#activity-9",
      },
    }, scopes.join());
  }
  const { result, sent } = await run({ story: "123", comment: "c" }, {
    ...acme,
    scopes: ["read", "story-write"],
  });
  assertEquals(result, {
    error:
      'The Shortcut token has scopes: read, story-write. This step needs a token with the scopes "read", plus "write" or "comment-write". Create one and run: slack env add SHORTCUT_API_TOKEN <token>',
  });
  assertEquals(sent.map((r) => r.path), ["/whoami"]);
});

Deno.test("an Observer's token can't comment", async () => {
  const { result, sent } = await run({ story: "123", comment: "c" }, {
    ...acme,
    tokenRole: "observer",
  });
  assertEquals(result, {
    error:
      "SHORTCUT_API_TOKEN belongs to Alex Doe (@alex), an Observer. Observers can't create stories or comments. Use a token from a Member, Admin, or Owner.",
  });
  assertEquals(sent.map((r) => r.path), ["/whoami"]);
});
