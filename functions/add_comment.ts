import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { connect } from "../lib/shortcut.ts";
import { runStep, StepError, trimmed } from "../lib/step.ts";
import { findSlackUsers, slackUser } from "../lib/slack.ts";
import { parseStoryRef, peopleFor } from "../lib/resolve.ts";
import {
  parseSlackText,
  sourceLine,
  toMarkdown,
  userIds,
} from "../lib/markup.ts";

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
        description:
          "Markdown. Slack mentions, channels, and links become Shortcut mentions and links.",
      },
      posted_by: {
        type: Schema.slack.types.user_id,
        title: "Posted by",
        description:
          "Shortcut shows the API token's owner as the author, so this person's name is added to the comment.",
      },
      source_url: {
        type: Schema.types.string,
        title: "Source link",
        description:
          "A link to the Slack message, such as the trigger's message link.",
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
  ({ inputs, env, client, team_id }) =>
    runStep(async () => {
      const commentIn = inputs.comment.trim();
      if (!commentIn) throw new StepError("Comment is empty.");
      const commentText = parseSlackText(commentIn);
      const mentioned = userIds(commentText);
      const sourceIn = trimmed(inputs.source_url);
      const source = sourceIn ? sourceLine(sourceIn) : undefined;
      const sc = await connect(env.SHORTCUT_API_TOKEN, "comment-write");
      const storyId = parseStoryRef(inputs.story, sc.workspace.slug);
      const [by, members, mentionedUsers] = await Promise.all([
        inputs.posted_by ? slackUser(client, inputs.posted_by) : undefined,
        mentioned.length ? sc.list("members") : [],
        findSlackUsers(client, mentioned),
      ]);
      const comment = toMarkdown(
        commentText,
        peopleFor(mentionedUsers, members),
        team_id,
      );
      // v4 lets only admins set author_id, so attribution goes in the text.
      const text = [
        comment,
        by && `_Posted from Slack by ${by.name}_`,
        source,
      ].filter((p) => p).join("\n\n");
      const posted = await sc.createComment(storyId, text);
      return { comment_url: posted.app_url };
    }),
);
