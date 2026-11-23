# Shortcut steps for Slack Workflow Builder

This Slack app adds two Shortcut steps to Slack Workflow Builder:

- **Create a Shortcut story** creates a story and outputs its ID and link.
- **Add a comment to a Shortcut story** posts a comment on a story and outputs
  the comment's link.

A typical workflow starts from a Slack form, creates a story from the answers,
and posts the story link back to the channel.

> [!IMPORTANT]
> Slack hosts this app for you. You don't need a server. You deploy it to your
> Slack workspace with one command, `slack deploy`, and Slack runs it on Slack's
> servers.
>
> You have to deploy it yourself because Slack doesn't allow workflow steps in
> apps from the Slack Marketplace. The Shortcut app in the Marketplace can't
> include these steps, so Shortcut publishes them here instead. The next section
> quotes Slack's rule.

## Why you have to deploy this app yourself

Shortcut would rather put these steps in the Shortcut app in the Slack
Marketplace, so they appear in Workflow Builder after a normal install. Slack's
rules forbid that. Slack's
[workflow steps documentation](https://docs.slack.dev/workflows/workflow-steps/)
says:

> Apps containing workflow steps cannot be distributed publicly or submitted to
> the Slack Marketplace.

It also says:

> We do not support distribution of workflow steps to other standalone
> workspaces (also known as public distribution).

Marketplace apps could once add steps to Workflow Builder through a Slack
feature called Steps from Apps. Slack retired Steps from Apps on September 26,
2024, and gave distributed apps no replacement. The
[retirement notice](https://docs.slack.dev/changelog/2023-08-workflow-steps-from-apps-step-back/)
says there is "no other path to distributing custom functions as part of a
distributed Slack app." Slack tells app developers to publish code that
customers deploy themselves. This repository is that code.

The Jira, Asana, and ClickUp steps in Workflow Builder are Slack connectors.
Slack builds connectors itself, and the same notice says connectors "cannot be
developed outside of Slack."

For you, this means:

- Someone who can install apps in your Slack workspace deploys this app with the
  Slack CLI. Slack runs the app on Slack's servers, so you don't host anything.
- The app is your workspace's own app. It uses a Shortcut API token that you
  create and store in Slack.
- Updates don't arrive on their own. To update, pull this repository and deploy
  again.
- The code that runs is the code in this repository. Read it before you deploy.

## Before you start

You need:

- A paid Slack plan. Slack doesn't allow custom workflow steps on the free plan.
- Permission to install apps in your Slack workspace, or an admin who approves
  the app.
- The [Slack CLI](https://docs.slack.dev/tools/slack-cli/), signed in to your
  workspace with `slack login`.
- A Shortcut API v4 token. In Shortcut, open **Settings** > **API Tokens**.
  Create a token with the `read` and `write` scopes. A token with `read`,
  `story-write`, and `comment-write` also works. The steps act as the Shortcut
  member who owns the token.

Slack may charge for workflows that use custom steps after your plan's monthly
allowance. Check Slack's pricing for your plan.

## Deploy the app

1. Clone this repository and open its folder:

   ```sh
   git clone https://github.com/useshortcut/slack-workflow-steps.git
   cd slack-workflow-steps
   ```

2. Deploy the app to your workspace:

   ```sh
   slack deploy
   ```

   When the CLI asks which workspace to deploy to, choose yours.

3. Store your Shortcut token in the deployed app:

   ```sh
   slack env add SHORTCUT_API_TOKEN sct_your_token
   ```

4. In Slack, open Workflow Builder, add a step, and search for **Shortcut**. The
   two steps appear under the app **Shortcut Steps**.

To update the app later, run `git pull`, then run `slack deploy` again.

## Build a workflow

This example files a bug from a Slack form.

1. In Workflow Builder, start a workflow from a link or a shortcut, and add a
   form step. Ask for a summary, the details, and a priority. Give the priority
   question the answers your Shortcut Priority field uses, such as High, Medium,
   and Low.
2. Add the step **Create a Shortcut story**. Set **Title** to the summary
   answer, **Description** to the details answer, and **Priority** to the
   priority answer. Set **Type** to Bug. Type your team's name in **Team**, for
   example `Infra`. Set **Requester** to the person who submitted the form.
3. Add a step that sends a message to a channel, and put the step's **Story
   link** output in the message.

Names you type must match Shortcut exactly, ignoring case. If a name doesn't
match, the step stops and its error lists the names Shortcut has. Test the
workflow once after you build it.

The [step reference](docs/steps.md) lists every input, output, and error
message.

## Limits

- Workflows that use these steps don't run for people from other organizations
  in Slack Connect channels. Slack limits custom steps to the workspace that
  deployed them.
- Shortcut shows every comment as written by the token's owner, because only
  Shortcut admins can post a comment as someone else. To name the person, set
  **Posted by**. The step then adds "Posted from Slack by" and their name to the
  comment.
- Each run of **Create a Shortcut story** creates a new story. The step doesn't
  check for duplicates.

## Planned

- [ ] **Link a Slack thread to a story.** This step will link a thread to a
      story, the same way the Shortcut Slack app's **Link Thread to Story**
      action does. Shortcut's API can't create thread links yet, so we'll add
      the step after we add that API. Until then, install the Shortcut app from
      the Slack Marketplace and use **Link Thread to Story** on a message in the
      thread. A workflow can also post the **Story link** output into the
      thread.

## Development

Install [Deno](https://deno.com), then run the checks and tests from the
repository folder:

```sh
deno task test
```

The tests replace `fetch` with a fake Shortcut API. The fake checks every
request against Shortcut's published
[v4 OpenAPI document](https://api.app.shortcut.com/api/v4/openapi), so a request
with an unknown field or a wrong type fails its test. The tests download that
document, so they need network access to `api.app.shortcut.com`. To run them
offline, save the document to a file and set `SHORTCUT_OPENAPI_FILE` to its
path.

The code is laid out like this:

- `functions/` has one file for each step. Each file defines the step's Workflow
  Builder inputs and outputs, and runs the step.
- `lib/shortcut.ts` is the only code that calls Shortcut.
- `lib/resolve.ts` turns names into Shortcut IDs. It makes no network calls.
- `lib/markup.ts` turns Slack message text into Shortcut text and story titles.
  It makes no network calls.
- `lib/slack.ts` reads a Slack user's name and email address.
- `lib/step.ts` turns a failure into the error message Workflow Builder shows.

## License

MIT. See [LICENSE](LICENSE).
