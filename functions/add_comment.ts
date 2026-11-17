import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { connect } from "../lib/shortcut.ts";
import { runStep, StepError } from "../lib/step.ts";
import { slackUser } from "../lib/slack.ts";
import { parseStoryRef } from "../lib/resolve.ts";

export const AddComment = DefineFunction({
  callback_id: "add_comment",
  title: "Add a comment to a Shortcut story",
  description: "Post a comment on a Shortcut story",
  source_file: "functions/add_comment.ts",
  input_parameters: {
    properties: {
      story: {
        type: Schema.types.string,
        title: "Story",
        description:
          "Story number (123), sc-123, or a story link. Map the Story link from a Create story step here.",
      },
      comment: {
        type: Schema.types.string,
        title: "Comment",
        description: "Markdown.",
      },
      posted_by: {
        type: Schema.slack.types.user_id,
        title: "Posted by",
        description:
          "Shortcut shows the API token's owner as the author, so this person's name is added to the comment.",
      },
    },
    required: ["story", "comment"],
  },
  output_parameters: {
    properties: {
      comment_url: { type: Schema.types.string, title: "Comment link" },
    },
    required: ["comment_url"],
  },
});

export default SlackFunction(
  AddComment,
  ({ inputs, env, client }) =>
    runStep(async () => {
      const comment = inputs.comment.trim();
      if (!comment) throw new StepError("Comment is empty.");
      const sc = await connect(env.SHORTCUT_API_TOKEN, "comment-write");
      const storyId = parseStoryRef(inputs.story, sc.workspace.slug);
      const by = inputs.posted_by
        ? await slackUser(client, inputs.posted_by)
        : undefined;
      // v4 lets only admins set author_id, so attribution goes in the text.
      const text = by
        ? `${comment}\n\n_Posted from Slack by ${by.name}_`
        : comment;
      const posted = await sc.createComment(storyId, text);
      return { comment_url: posted.app_url };
    }),
);
