import { assertEquals } from "@std/assert";
import manifest from "../manifest.ts";
import { AddComment } from "../functions/add_comment.ts";
import { CreateStory } from "../functions/create_story.ts";

type Params = {
  properties: Record<string, { type: string }>;
  required?: readonly string[];
};

const shape = (params: Params | undefined) => ({
  types: Object.fromEntries(
    Object.entries(params?.properties ?? {}).map(([name, p]) => [name, p.type]),
  ),
  required: params?.required,
});

// Saved workflows refer to inputs and outputs by name, so a rename or a type
// change breaks every workflow that uses the step.
Deno.test("Create Story keeps its input and output names and types", () => {
  const { input_parameters, output_parameters } = CreateStory.definition;
  assertEquals(shape(input_parameters), {
    types: {
      title: "string",
      description: "string",
      story_type: "string",
      team: "string",
      project: "string",
      workflow_state: "string",
      priority: "string",
      owner: "slack#/types/user_id",
      requester: "slack#/types/user_id",
    },
    required: ["title"],
  });
  assertEquals(shape(output_parameters), {
    types: { story_id: "integer", story_url: "string" },
    required: ["story_id", "story_url"],
  });
});

Deno.test("Add Comment keeps its input and output names and types", () => {
  const { input_parameters, output_parameters } = AddComment.definition;
  assertEquals(shape(input_parameters), {
    types: {
      story: "string",
      comment: "string",
      posted_by: "slack#/types/user_id",
    },
    required: ["story", "comment"],
  });
  assertEquals(shape(output_parameters), {
    types: { comment_url: "string" },
    required: ["comment_url"],
  });
});

Deno.test("the manifest lists every step and reaches only Shortcut's API", async () => {
  const files = [];
  for await (
    const f of Deno.readDir(new URL("../functions", import.meta.url))
  ) {
    files.push(`functions/${f.name}`);
  }
  assertEquals(
    Object.values(manifest.functions ?? {}).map((f) => f.source_file).sort(),
    files.sort(),
  );
  assertEquals(manifest.outgoing_domains, ["api.app.shortcut.com"]);
});
