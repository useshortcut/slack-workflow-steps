import { assertEquals } from "@std/assert";
import {
  parseSlackText,
  type Person,
  storyTitle,
  toMarkdown,
  toPlainText,
} from "../lib/markup.ts";

Deno.test("text without references is one text piece", () => {
  assertEquals(parseSlackText("Login fails > twice"), [
    { kind: "text", text: "Login fails > twice" },
  ]);
});

Deno.test("each reference becomes a piece of its kind", () => {
  const text =
    "<@U1> <@W2|jo> <#C3|general> <!subteam^S4|@eng> <!here> <https://x.com|X> <mailto:a@b.com>";
  assertEquals(parseSlackText(text).filter((p) => p.kind !== "text"), [
    { kind: "user", id: "U1" },
    { kind: "user", id: "W2", label: "jo" },
    { kind: "channel", id: "C3", label: "general" },
    { kind: "usergroup", id: "S4", label: "@eng" },
    { kind: "special", name: "here" },
    { kind: "link", url: "https://x.com", label: "X" },
    { kind: "link", url: "mailto:a@b.com" },
  ]);
});

Deno.test("a reference with an empty part before the pipe stays as text", () => {
  assertEquals(parseSlackText("a <|x> b <> c"), [
    { kind: "text", text: "a <|x> b <> c" },
  ]);
});

Deno.test("a blank label counts as no label", () => {
  assertEquals(parseSlackText("<https://x.com|  >"), [
    { kind: "link", url: "https://x.com" },
  ]);
});

Deno.test("entities decode once, in text and in references", () => {
  assertEquals(
    parseSlackText("&amp;lt; &lt;b&gt; <https://x.com/?a=1&amp;b=2|A &amp; B>"),
    [
      { kind: "text", text: "&lt; <b> " },
      { kind: "link", url: "https://x.com/?a=1&b=2", label: "A & B" },
    ],
  );
});

Deno.test("a date shows its fallback text", () => {
  const pieces = parseSlackText("Due <!date^123^{date}|Nov 23>");
  assertEquals(pieces[1], {
    kind: "special",
    name: "date^123^{date}",
    label: "Nov 23",
  });
  assertEquals(toMarkdown(pieces, new Map(), "T1"), "Due Nov 23");
});

const people = new Map<string, Person>([
  ["U1", { name: "Jo Park", member: { id: "m1", mention_name: "jo_park" } }],
  ["U2", { name: "Pat Kim" }],
]);

Deno.test("markdown names members with Shortcut mentions and links the rest", () => {
  const pieces = parseSlackText(
    "<@U1> <@U2> <@U9> <@U9|ghost> <#C3|general> <#C3> <!subteam^S4|@eng> <!subteam^S4> <!channel> <https://x.com/a_(b)|[docs]> <https://x.com>",
  );
  assertEquals(
    toMarkdown(pieces, people, "T1").split(" "),
    [
      "[@jo\\_park](shortcutapp://members/m1)",
      "@Pat",
      "Kim",
      "<@U9>",
      "ghost",
      "[#general](https://slack.com/app_redirect?channel=C3&team=T1)",
      "[Slack",
      "channel](https://slack.com/app_redirect?channel=C3&team=T1)",
      "@eng",
      "@user",
      "group",
      "@channel",
      "[\\[docs\\]](https://x.com/a_\\(b\\))",
      "https://x.com",
    ],
  );
});

Deno.test("plain text keeps names and drops link syntax", () => {
  const pieces = parseSlackText(
    "<@U1> <@U2> <@U9> <#C3|general> <!here> <https://x.com|docs> <https://y.com>",
  );
  assertEquals(
    toPlainText(pieces, people),
    "@jo_park @Pat Kim <@U9> #general @here docs https://y.com",
  );
});

Deno.test("the title is the first sentence of the first line with text", () => {
  assertEquals(storyTitle("\n  \nLogin fails. It hangs.\nMore"), "Login fails");
});

Deno.test("a title without a sentence end keeps the whole line", () => {
  assertEquals(
    storyTitle("  Login fails on v1.2  \nMore"),
    "Login fails on v1.2",
  );
});

Deno.test("a period inside a link doesn't end the title, one after it does", () => {
  assertEquals(
    storyTitle("Docs at https://example.com/v1.2/guide. Also more"),
    "Docs at https://example.com/v1.2/guide",
  );
});

Deno.test("the title keeps 512 characters after the cut", () => {
  assertEquals(storyTitle("x".repeat(600) + ". y"), "x".repeat(512));
});
