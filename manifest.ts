import { Manifest } from "deno-slack-sdk/mod.ts";
import { CreateStory } from "./functions/create_story.ts";
import { SHORTCUT_HOST } from "./lib/shortcut.ts";

export default Manifest({
  name: "Shortcut Steps",
  description: "Shortcut steps for Slack Workflow Builder",
  icon: "assets/icon.png",
  functions: [CreateStory],
  outgoingDomains: [SHORTCUT_HOST],
  // users:read.email matches a Slack user to the Shortcut member with the same email.
  botScopes: ["users:read", "users:read.email"],
});
