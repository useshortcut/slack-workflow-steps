import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { connect } from "../lib/shortcut.ts";
import { runStep, StepError, trimmed } from "../lib/step.ts";
import { slackUser } from "../lib/slack.ts";
import {
  memberFor,
  parseStateInput,
  pickOne,
  priorityValue,
  teamAliases,
  workflowFor,
} from "../lib/resolve.ts";

export const CreateStory = DefineFunction({
  callback_id: "create_story",
  title: "Create a Shortcut story",
  description: "Create a story in Shortcut and output its link",
  source_file: "functions/create_story.ts",
  input_parameters: {
    properties: {
      title: {
        type: Schema.types.string,
        title: "Title",
        description: "Text past 512 characters is cut off.",
      },
      description: {
        type: Schema.types.string,
        title: "Description",
        description: "Markdown.",
      },
      story_type: {
        type: Schema.types.string,
        title: "Type",
        enum: ["feature", "bug", "chore"],
        choices: [
          { value: "feature", title: "Feature" },
          { value: "bug", title: "Bug" },
          { value: "chore", title: "Chore" },
        ],
        default: "feature",
      },
      team: {
        type: Schema.types.string,
        title: "Team",
        description:
          "Team name, @mention name, or ID. The story starts in this team's default workflow.",
      },
      project: {
        type: Schema.types.string,
        title: "Project",
        description:
          "Project name or ID. Leave empty if your workspace doesn't use projects.",
      },
      workflow_state: {
        type: Schema.types.string,
        title: "Workflow state",
        description:
          'A state name such as "Ready for Dev", or "Workflow / State" to pick another workflow. Empty uses the default state.',
      },
      priority: {
        type: Schema.types.string,
        title: "Priority",
        description: "A value of the Priority field, such as High.",
      },
      owner: {
        type: Schema.slack.types.user_id,
        title: "Owner",
        description: "Matched to Shortcut by email.",
      },
      requester: {
        type: Schema.slack.types.user_id,
        title: "Requester",
        description:
          "Matched to Shortcut by email. Empty uses the owner of the API token.",
      },
    },
    required: ["title"],
  },
  output_parameters: {
    properties: {
      story_id: { type: Schema.types.integer, title: "Story ID" },
      story_url: { type: Schema.types.string, title: "Story link" },
    },
    required: ["story_id", "story_url"],
  },
});

export default SlackFunction(
  CreateStory,
  ({ inputs, env, client }) =>
    runStep(async () => {
      const title = inputs.title.trim().slice(0, 512);
      if (!title) throw new StepError("Title is empty.");
      const teamIn = trimmed(inputs.team);
      const projectIn = trimmed(inputs.project);
      const stateIn = trimmed(inputs.workflow_state);
      const priorityIn = trimmed(inputs.priority);
      const { owner: ownerId, requester: requesterId } = inputs;

      const sc = await connect(env.SHORTCUT_API_TOKEN, "story-write");
      const state = stateIn ? parseStateInput(stateIn) : undefined;
      const [teams, projects, workflows, members, fields, owner, requester] =
        await Promise.all([
          teamIn ? sc.list("teams") : [],
          projectIn ? sc.list("projects") : [],
          state?.workflow ? sc.list("workflows") : [],
          ownerId || requesterId ? sc.list("members") : [],
          priorityIn ? sc.list("custom-fields") : [],
          ownerId ? slackUser(client, ownerId) : undefined,
          requesterId ? slackUser(client, requesterId) : undefined,
        ]);

      const where = `Shortcut workspace "${sc.workspace.name}"`;
      const team = teamIn
        ? pickOne("Team", teamIn, teams, where, { aliases: teamAliases })
        : undefined;
      const project = projectIn
        ? pickOne("Project", projectIn, projects, where)
        : undefined;
      const named = state?.workflow
        ? pickOne("Workflow", state.workflow, workflows, where)
        : undefined;
      const workflow = workflowFor(named, project, team, sc.defaultWorkflow);
      const stateId = state
        ? pickOne(
          "State",
          state.state,
          await sc.states(workflow.id),
          `workflow "${workflow.name}"`,
          { hint: ' To use another workflow, enter "Workflow / State".' },
        ).id
        : await sc.defaultStateId(workflow.id);

      const story = await sc.createStory({
        name: title,
        workflow_state_id: stateId,
        description: trimmed(inputs.description),
        story_type: inputs.story_type,
        team_id: team?.id,
        project_id: project?.id,
        owner_ids: owner ? [memberFor(members, owner, "Owner").id] : undefined,
        requester_id: requester
          ? memberFor(members, requester, "Requester").id
          : undefined,
        custom_field_values: priorityIn
          ? [priorityValue(fields, priorityIn)]
          : undefined,
      });
      return { story_id: story.id, story_url: story.app_url };
    }),
);
