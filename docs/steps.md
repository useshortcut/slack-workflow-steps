# Step reference

Each step trims every text input. An optional input that is empty or only spaces
counts as empty.

## Create a Shortcut story

Callback ID: `create_story`.

### Inputs

| Input          | Type                   | Required | Description                                                                                                                                                                                                                                                                   |
| -------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Title          | Text                   | Yes      | The story's name, as plain text. See [Slack text](#slack-text). The step uses the first line that has text. It stops before the first period that a space follows, and keeps at most 512 characters, Shortcut's limit.                                                        |
| Description    | Text                   | No       | Markdown. See [Slack text](#slack-text).                                                                                                                                                                                                                                      |
| Type           | Feature, Bug, or Chore | No       | Default: Feature.                                                                                                                                                                                                                                                             |
| Team           | Text                   | No       | A team's name, mention name, `@` mention name, or ID.                                                                                                                                                                                                                         |
| Project        | Text                   | No       | A project's name or ID.                                                                                                                                                                                                                                                       |
| Workflow state | Text                   | No       | A state's name, such as `Ready for Dev`. To name a state in another workflow, enter `Workflow / State`, such as `Design / In Review`.                                                                                                                                         |
| Priority       | Text                   | No       | A value of the workspace's Priority field, such as `High`.                                                                                                                                                                                                                    |
| Owner          | Slack user             | No       | The step matches the person to a Shortcut member by email address.                                                                                                                                                                                                            |
| Requester      | Slack user             | No       | The step matches the person the same way as Owner. If Requester is empty, the token's owner is the requester.                                                                                                                                                                 |
| Source link    | Text                   | No       | An `https` link to the Slack message, such as the trigger's message link. The step adds `*Created in Slack from [this message](<link>).*` to the end of the description, the way the Shortcut Slack app does. If **Description** is empty, the description is just this line. |

### Outputs

| Output     | Type    | Description                        |
| ---------- | ------- | ---------------------------------- |
| Story ID   | Integer | The story's number, such as `123`. |
| Story link | Text    | The story's URL in Shortcut.       |

### How names become Shortcut IDs

A name matches when it equals the item's name or ID, ignoring case. A team also
matches its mention name, with or without `@`. The step doesn't match partial
names.

The step looks up the workflow state in one workflow. It picks the first of:

1. The workflow named in `Workflow / State`.
2. The project's workflow, if **Project** is set.
3. The team's default workflow, if **Team** is set.
4. The workspace's default workflow.

If **Workflow state** is empty, the story gets that workflow's default state.

If **Project** is set, a workflow named in **Workflow state** must be the
project's workflow. Shortcut doesn't allow a project's story in another
workflow.

If **Team** is set, the workflow the step picks must be one of the team's
workflows. This includes the project's workflow when **Project** is also set.
Shortcut doesn't allow a team's story in a workflow the team doesn't use.

The step finds Owner and Requester by the email address in their Slack profile.
It compares that address with the email address on each Shortcut member's
profile, ignoring case. Other email addresses on the member's Shortcut account
don't match. The member must not be disabled.

## Add a comment to a Shortcut story

Callback ID: `add_comment`.

### Inputs

| Input       | Type       | Required | Description                                                                                                                                                                                        |
| ----------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Story       | Text       | Yes      | One of: `123`, `#123`, `sc-123`, `[sc-123]`, or a story link such as `https://app.shortcut.com/acme/story/123/login-fails`. You can use the **Story link** output of **Create a Shortcut story**.  |
| Comment     | Text       | Yes      | Markdown. See [Slack text](#slack-text).                                                                                                                                                           |
| Posted by   | Slack user | No       | The step adds "Posted from Slack by" and this person's Slack name to the end of the comment.                                                                                                       |
| Source link | Text       | No       | An `https` link to the Slack message, such as the trigger's message link. The step adds `*Created in Slack from [this message](<link>).*` to the end of the comment, after the **Posted by** line. |

### Outputs

| Output       | Type | Description                    |
| ------------ | ---- | ------------------------------ |
| Comment link | Text | The comment's URL in Shortcut. |

## Slack text

Text from a Slack message holds mentions, channels, and links in Slack's own
markup, such as `<@U012AB3CD>`. The steps turn that markup into what the
Shortcut Slack app writes. **Title** gets plain text. **Description** and
**Comment** get Markdown.

| In Slack                    | In Markdown                                                                                                                            | In plain text                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| A person                    | A Shortcut mention, such as `@jo`, if the person is a Shortcut member. Otherwise `@` and their Slack name.                             | `@` and the mention or Slack name.                          |
| A channel                   | A link that opens the channel in Slack, such as `#support`. If Slack didn't send the channel's name, the link text is `Slack channel`. | The channel's name, such as `#support`, or `Slack channel`. |
| A user group                | The group's name, such as `@eng`.                                                                                                      | The same.                                                   |
| `@here`, `@channel`, a date | The text Slack shows, such as `@here` or `Nov 23`.                                                                                     | The same.                                                   |
| A link                      | The link, with its text if it has text.                                                                                                | The link's text, or the URL.                                |

The steps match a person to a Shortcut member the same way as **Owner**. A
person who isn't a member, or whom Slack can't look up, doesn't stop the step.
If Slack can't look up the person, the text keeps the name Slack sent with the
mention, or else the Slack markup.

The steps also decode `&amp;`, `&lt;`, and `&gt;`, which Slack sends in place of
`&`, `<`, and `>`.

## Error messages

When a step fails, Workflow Builder shows one of these messages. Words in angle
brackets stand for values from your workspace.

### Token

| Message                                                                                                                         | Cause                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHORTCUT_API_TOKEN is not set. Run: slack env add SHORTCUT_API_TOKEN <token>`                                                  | The deployed app has no token.                                                                                                                      |
| `SHORTCUT_API_TOKEN is not a Shortcut v4 token (it should start with "sct_"). ...`                                              | The token is a v3 token or not a Shortcut token.                                                                                                    |
| `Shortcut refused SHORTCUT_API_TOKEN (403). This step needs a token with the scopes "read", plus "write" or "story-write". ...` | The token doesn't have the `read` scope. In **Add a comment to a Shortcut story**, the message names `comment-write`.                               |
| `The Shortcut token has scopes: <scopes>. This step needs a token with the scopes "read", plus "write" or "story-write". ...`   | The token can't create stories or comments. In **Add a comment to a Shortcut story**, the message names `comment-write`.                            |
| `SHORTCUT_API_TOKEN belongs to <name> (@<mention name>), an Observer. ...`                                                      | The token's owner has the Observer role. Shortcut lets only Members, Admins, and Owners create stories and comments. Create a token as one of them. |
| `Shortcut rejected SHORTCUT_API_TOKEN (401). It may be revoked or for another workspace.`                                       | Shortcut doesn't accept the token.                                                                                                                  |

### Inputs

| Message                                                                               | Cause                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Title is empty.`                                                                     | **Title** has no text, or nothing comes before its first sentence end.                                                                                                                                                              |
| `Comment is empty.`                                                                   | **Comment** has no text.                                                                                                                                                                                                            |
| `Source link "<input>" is not a link.`                                                | **Source link** isn't an `https` link.                                                                                                                                                                                              |
| `<Kind> "<input>" not found in <place>. Choose one of: <names>.`                      | No team, project, workflow, state, or priority value has that name. The message lists up to 15 names.                                                                                                                               |
| `<Kind> "<input>" matches more than one: <name> (<id>), .... Enter the ID instead.`   | Two items share the name. Enter the ID from the message.                                                                                                                                                                            |
| `Workflow "<name>" doesn't match project "<name>", which uses workflow "<name>". ...` | **Workflow state** names a workflow, but **Project** uses a different one. Shortcut requires a project's stories to use the project's workflow.                                                                                     |
| `Team "<name>" doesn't use workflow "<name>". Its workflows are: <names>. ...`        | The story's workflow isn't one of the team's workflows. The workflow comes from **Workflow state**, **Project**, or the workspace default. Choose a state in one of the team's workflows, a project that uses one, or another team. |
| `This workspace has no Priority field. ...`                                           | **Priority** is set, but the workspace's Priority field is off.                                                                                                                                                                     |
| `No active Shortcut member has <email> (<@user>) as their profile email. ...`         | The Owner or Requester isn't a Shortcut member, is disabled, or has another email address on their Shortcut profile.                                                                                                                |
| `Slack has no email for <@user>, ...`                                                 | The Owner or Requester is a bot or app, or Slack doesn't share the person's email address.                                                                                                                                          |
| `Slack could not look up <@user> (<error>).`                                          | Slack couldn't return the person's profile.                                                                                                                                                                                         |
| `"<input>" is not a story. Use a story number (123), sc-123, or a story link.`        | **Story** isn't in a form the step reads.                                                                                                                                                                                           |
| `That story link is for workspace "<slug>", but SHORTCUT_API_TOKEN is for "<slug>".`  | The link points to another Shortcut workspace.                                                                                                                                                                                      |
| `Story <id> not found in Shortcut workspace "<name>".`                                | The story doesn't exist, or the token's owner can't see it.                                                                                                                                                                         |

### Shortcut responses

| Message                                                                                                                             | Cause                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Shortcut rate limit reached (200 requests per minute per token). Wait a minute and rerun the workflow.`                            | The token made too many requests.                                                                                                    |
| `Shortcut is unavailable (<status>). Rerun the workflow later.`                                                                     | Shortcut failed while the step looked up names. Nothing was created.                                                                 |
| `Shortcut did not confirm the story (<status>). It may have been created anyway. Check Shortcut before you run the workflow again.` | Shortcut failed while it created the story. In **Add a comment to a Shortcut story**, the message says "comment" instead of "story". |
| `Shortcut rejected the story (<status>): <reply>`                                                                                   | Shortcut refused the story. The reply says why.                                                                                      |
| `Shortcut rejected the comment (<status>): <reply>`                                                                                 | Shortcut refused the comment.                                                                                                        |
| `Shortcut returned <status> for <path>: <reply>`                                                                                    | A lookup failed for another reason.                                                                                                  |
| ``Unexpected error: <message>. Run `slack activity` for details.``                                                                  | This app has a bug. Run `slack activity` and report the error in this repository's issues.                                           |
