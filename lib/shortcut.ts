import { StepError } from "./step.ts";

export const SHORTCUT_HOST = "api.app.shortcut.com";
const API = `https://${SHORTCUT_HOST}/api/v4`;

export type WriteScope = "story-write" | "comment-write";

export type Ref = { id: number; name: string };
export type Team = {
  id: string;
  name: string;
  mention_name: string | null;
  default_workflow: Ref | null;
};
export type Project = { id: number; name: string; workflow: Ref | null };
export type Member = { id: string; email_address: string | null };
export type CustomField = {
  id: string;
  canonical_name: string | null;
  enabled: boolean;
  values: { id: string; value: string; enabled: boolean }[] | null;
};

export type CreateStoryBody = {
  name: string;
  workflow_state_id: number;
  description?: string;
  /** Slack holds this to the step's Type choices: feature, bug, chore. */
  story_type?: string;
  team_id?: string;
  project_id?: number;
  owner_ids?: string[];
  requester_id?: string;
  custom_field_values?: { field_id: string; value_id: string }[];
};

type Lists = {
  teams: Team;
  projects: Project;
  members: Member;
  "custom-fields": CustomField;
  workflows: Ref;
};

export type Shortcut = {
  workspace: { slug: string; name: string };
  defaultWorkflow: Ref;
  list<K extends keyof Lists>(kind: K): Promise<Lists[K][]>;
  states(workflowId: number): Promise<Ref[]>;
  defaultStateId(workflowId: number): Promise<number>;
  createStory(body: CreateStoryBody): Promise<{ id: number; app_url: string }>;
  createComment(storyId: number, text: string): Promise<{ app_url: string }>;
};

type Whoami = {
  workspace: { slug: string; name: string };
  default_workflow: Ref;
  default_workflow_state: Ref;
  authorization: { scopes: string[] };
};

export async function connect(
  token: string | undefined,
  scope: WriteScope,
): Promise<Shortcut> {
  if (!token) {
    throw new StepError(
      "SHORTCUT_API_TOKEN is not set. Run: slack env add SHORTCUT_API_TOKEN <token>",
    );
  }
  if (!token.startsWith("sct_")) {
    throw new StepError(
      'SHORTCUT_API_TOKEN is not a Shortcut v4 token (it should start with "sct_"). Create one in Shortcut under Settings > API Tokens.',
    );
  }

  const parse = async <T>(res: Response, url: string): Promise<T> => {
    if (!res.ok) {
      const path = new URL(url).pathname;
      throw new StepError(
        `Shortcut returned ${res.status} for ${path}: ${await excerpt(res)}`,
      );
    }
    return await res.json();
  };
  const get = async <T>(url: string) =>
    parse<T>(await send(token, "GET", url), url);
  const pages = async <T>(url: string): Promise<T[]> => {
    const items: T[] = [];
    for (let next: string | undefined = url; next;) {
      const page: { entities: T[]; next_page_url?: string } = await get(next);
      items.push(...page.entities);
      next = page.next_page_url;
    }
    return items;
  };

  const needs =
    `This step needs a token with the scopes "read", plus "write" or "${scope}". Create one and run: slack env add SHORTCUT_API_TOKEN <token>`;
  const whoamiUrl = `${API}/whoami`;
  const whoami = await send(token, "GET", whoamiUrl);
  if (whoami.status === 403) {
    throw new StepError(`Shortcut refused SHORTCUT_API_TOKEN (403). ${needs}`);
  }
  const me = (await parse<{ entity: Whoami }>(whoami, whoamiUrl)).entity;
  const scopes = me.authorization.scopes;
  if (!scopes.includes("write") && !scopes.includes(scope)) {
    throw new StepError(
      `The Shortcut token has scopes: ${scopes.join(", ")}. ${needs}`,
    );
  }

  const base = `${API}/${me.workspace.slug}`;
  return {
    workspace: me.workspace,
    defaultWorkflow: me.default_workflow,
    list: (kind) => pages(`${base}/${kind}?limit=100`),
    states: (workflowId) =>
      pages(`${base}/workflows/${workflowId}/states?limit=100`),
    defaultStateId: async (workflowId) => {
      if (workflowId === me.default_workflow.id) {
        return me.default_workflow_state.id;
      }
      const workflow = await get<{
        entity: { default_workflow_state: Ref };
      }>(`${base}/workflows/${workflowId}`);
      return workflow.entity.default_workflow_state.id;
    },
    createStory: async (body) => {
      const res = await send(token, "POST", `${base}/stories`, body, "story");
      if (!res.ok) {
        throw new StepError(
          `Shortcut rejected the story (${res.status}): ${await excerpt(res)}`,
        );
      }
      return (await res.json()).entity;
    },
    createComment: async (storyId, text) => {
      const url = `${base}/stories/${storyId}/comments`;
      const res = await send(token, "POST", url, { text }, "comment");
      if (res.status === 404) {
        throw new StepError(
          `Story ${storyId} not found in Shortcut workspace "${me.workspace.name}".`,
        );
      }
      if (!res.ok) {
        const reply = await excerpt(res);
        throw new StepError(
          `Shortcut rejected the comment (${res.status}): ${reply}`,
        );
      }
      return (await res.json()).entity;
    },
  };
}

async function send(
  token: string,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
  write?: "story" | "comment",
): Promise<Response> {
  const unavailable = (detail: string | number) =>
    new StepError(
      write
        ? `Shortcut did not confirm the ${write} (${detail}). It may have been created anyway. Check Shortcut before you run the workflow again.`
        : `Shortcut is unavailable (${detail}). Rerun the workflow later.`,
    );

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw unavailable("network error");
  }
  if (res.status === 401) {
    throw new StepError(
      "Shortcut rejected SHORTCUT_API_TOKEN (401). It may be revoked or for another workspace.",
    );
  }
  if (res.status === 429) {
    throw new StepError(
      "Shortcut rate limit reached (200 requests per minute per token). Wait a minute and rerun the workflow.",
    );
  }
  if (res.status >= 500) throw unavailable(res.status);
  return res;
}

async function excerpt(res: Response): Promise<string> {
  return (await res.text()).slice(0, 300);
}
