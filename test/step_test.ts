import { assertEquals } from "@std/assert";
import { runStep, StepError } from "../lib/step.ts";

Deno.test("a StepError reaches the user as written", async () => {
  const result = await runStep(() => {
    throw new StepError("Title is empty.");
  });
  assertEquals(result, { error: "Title is empty." });
});

Deno.test("any other error points the user at slack activity", async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const result = await runStep(() => {
      throw new TypeError("x is undefined");
    });
    assertEquals(result, {
      error:
        "Unexpected error: x is undefined. Run `slack activity` for details.",
    });
  } finally {
    console.error = quiet;
  }
});
