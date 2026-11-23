# Shortcut steps for Slack Workflow Builder

This Slack app adds two Shortcut steps to Slack Workflow Builder:

- **Create a Shortcut story** creates a story and outputs its ID and link.
- **Add a comment to a Shortcut story** posts a comment on a story and outputs
  the comment's link.

A typical workflow starts when someone reacts to a message with an emoji,
creates a story from the message, and posts the story link in the thread.

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
- A Shortcut API v4 token. In Shortcut, open **Settings** > **API Tokens**.
  Create a token with the `read` and `write` scopes. A token with `read`,
  `story-write`, and `comment-write` also works.

Shortcut shows the token's owner as the author of every comment and as the
default requester of every story. The owner must be a Member, Admin, or Owner,
because Observers can't create stories or comments. If the whole team will use
the steps, consider a token from a shared Shortcut account rather than your own.

Slack may charge for workflows that use custom steps after your plan's monthly
allowance. Check Slack's pricing for your plan.

## Deploy the app

1. Install the [Slack CLI](https://docs.slack.dev/tools/slack-cli/). On macOS
   and Linux:

   ```sh
   curl -fsSL https://downloads.slack-edge.com/slack-cli/install.sh | bash
   ```

2. Sign in to your Slack workspace:

   ```sh
   slack login
   ```

   The CLI prints a command that starts with `/slackauthticket`. Paste it into a
   message box in Slack and send it. Then enter the code that Slack shows in the
   terminal.

3. Clone this repository and open its folder:

   ```sh
   git clone https://github.com/useshortcut/slack-workflow-steps.git
   cd slack-workflow-steps
   ```

4. Deploy the app to your workspace:

   ```sh
   slack deploy
   ```

   When the CLI asks which workspace to deploy to, choose yours. If your
   workspace requires approval for apps, an admin must approve the app before
   you continue.

5. Store your Shortcut token in the deployed app:

   ```sh
   slack env add SHORTCUT_API_TOKEN sct_your_token
   ```

6. Let everyone in the workspace use the steps. Until you do, only you see them:

   ```sh
   slack function access --name create_story --everyone --grant
   slack function access --name add_comment --everyone --grant
   ```

   To allow only some people, replace `--everyone` with their Slack user IDs,
   such as `--users U012AB3CD,U045EF6GH`.

7. In Slack, open Workflow Builder, add a step, and search for **Shortcut**. The
   two steps appear under the app **Shortcut Steps**. To find your workflows,
   click **Agents & tools** in Slack's sidebar, then **Workflows**.

To see what the steps did, run `slack activity --tail`.

### Update the app

Run `git pull`, then run `slack deploy` again. If the update adds Slack
permissions, an admin may need to approve them again. If a step in a workflow
still shows its old inputs after an update, delete the step from the workflow
and add it again.

## Build a workflow

### File a story from an emoji reaction

1. In Workflow Builder, start a workflow with the trigger **When an emoji
   reaction is used**. Choose an emoji, such as 🎫, and a channel.
2. Add the step **Create a Shortcut story**. Set **Message** to the trigger's
   **Link to the message that was reacted to**: click `{ }` next to **Message**
   and choose it from the list. Leave **Title** and **Description** empty. The
   step reads the message, makes its first sentence the title and its whole text
   the description, and links back to it. Type your team's name in **Team** if
   your stories belong to teams.
3. Add a step that replies in the message's thread, such as **Reply to a message
   in thread**. Set the message to **Link to the message that was reacted to**,
   and put the step's **Story link** output in the reply.
4. Publish the workflow, then react to a message with the emoji. The workflow
   runs once for each message.

The app reads the message from Slack. It joins a public channel the first time
it reads a message there. For a private channel, add the app to the channel
first: click the channel's name, then **Integrations** > **Add apps**.

### File a bug from a form

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
  **Posted by**. The step then adds "Posted from Slack by" and their Shortcut
  mention to the comment, or their Slack name if they aren't a Shortcut member.
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

To try a change in Slack before you deploy it, put your token in a `.env` file
and run the app from your computer:

```sh
echo 'SHORTCUT_API_TOKEN=sct_your_token' > .env
slack run
```

The app appears in Workflow Builder as **Shortcut Steps (local)**, and works
only while `slack run` is running. It is a separate app from the deployed one,
so a workflow built with it must be rebuilt with **Shortcut Steps** later.

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
