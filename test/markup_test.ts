import { assertEquals } from "@std/assert";
import { storyTitle } from "../lib/markup.ts";

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
