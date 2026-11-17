import { Manifest } from "deno-slack-sdk/mod.ts";
import { AddComment } from "./functions/add_comment.ts";
import { CreateStory } from "./functions/create_story.ts";
import { SHORTCUT_HOST } from "./lib/shortcut.ts";

export default Manifest({
  name: "Shortcut Steps",
  description: "Shortcut steps for Slack Workflow Builder",
  icon: "assets/icon.png",
  functions: [CreateStory, AddComment],
  outgoingDomains: [SHORTCUT_HOST],
  botScopes: ["users:read", "users:read.email"],
});
