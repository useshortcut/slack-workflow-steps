import { Ajv } from "ajv";
import { stub } from "@std/testing/mock";

const API = "https://api.app.shortcut.com/api/v4";
const SLUG = "acme";
/** Short fixture lists still span pages, whatever limit the client asks for. */
const PAGE_SIZE = 2;

export type FakeWorkspace = {
  scopes?: string[];
  tokenRole?: string;
  defaultWorkflow: number;
  workflows: {
    id: number;
    name: string;
    defaultState: number;
    states: [number, string][];
  }[];
  teams?: {
    id: string;
    name: string;
    mention_name?: string | null;
    workflow?: number;
    /** The team's workflows. Default: just its default workflow. */
    workflows?: number[];
  }[];
  projects?: { id: number; name: string; workflow?: number }[];
  members?: { id: string; email: string | null }[];
  customFields?: {
    id: string;
    name: string;
    canonical_name: string | null;
    enabled: boolean;
    values: { id: string; value: string; enabled: boolean }[];
  }[];
  slackUsers?: Record<string, { name: string; email?: string }>;
  failures?: Record<string, number | "network">;
};

export type Sent = { method: string; path: string; body?: unknown };

type Spec = {
  paths: Record<string, Record<string, Operation>>;
  components: Record<string, Record<string, unknown>>;
};
type Ref = { $ref: string };
type Content = { content?: Record<string, { schema: object }> };
type Operation = {
  parameters?: { in: string; name: string; schema: object }[];
  requestBody?: Content | Ref;
  responses: Record<string, Content | Ref>;
};

const realFetch = globalThis.fetch;
const dropped = new TypeError("connection reset");
let contract: Promise<Contract> | undefined;

function loadContract(): Promise<Contract> {
  contract ??= (async () => {
    const file = Deno.env.get("SHORTCUT_OPENAPI_FILE");
    const text = file
      ? await Deno.readTextFile(file)
      : await (await realFetch(`${API}/openapi`)).text();
    return new Contract(JSON.parse(text));
  })();
  return contract;
}

class Contract {
  #paths: {
    pattern: RegExp;
    names: string[];
    ops: Record<string, Operation>;
  }[];
  #bodies = new Ajv({ strict: false, allErrors: true });
  #params = new Ajv({ strict: false, coerceTypes: true });
  #doc: Spec;

  constructor(spec: Spec) {
    const doc = this.#doc = forAjv(spec) as Spec;
    this.#paths = Object.entries(doc.paths).map(([template, ops]) => ({
      pattern: new RegExp(`^${template.replace(/\{[^}]+\}/g, "([^/]+)")}$`),
      names: [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]),
      ops,
    }));
    for (const ajv of [this.#bodies, this.#params]) {
      ajv.addSchema({ components: doc.components }, "spec");
      ajv.addFormat("uuid", /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
      ajv.addFormat("date-time", (s: string) => !isNaN(Date.parse(s)));
      ajv.addFormat("int64", { type: "number", validate: Number.isInteger });
      ajv.addFormat("css-color", true);
    }
  }

  checkRequest(method: string, url: URL, body: unknown): string[] {
    const found = this.#find(method, url);
    if (!found) return [`v4 has no operation ${method} ${url.pathname}`];
    const { op, path } = found;
    const params = (where: string) =>
      new Map(
        (op.parameters ?? []).filter((p) => p.in === where).map((p) => [
          p.name,
          p.schema,
        ]),
      );
    const problems: string[] = [];
    const inPath = params("path");
    for (const [name, value] of path) {
      problems.push(
        ...this.#validate(
          this.#params,
          inPath.get(name),
          value,
          `path ${name}`,
        ),
      );
    }
    const inQuery = params("query");
    for (const [name, value] of url.searchParams) {
      problems.push(
        ...this.#validate(
          this.#params,
          inQuery.get(name),
          value,
          `query ${name}`,
        ),
      );
    }
    const bodySchema = this.#json(op.requestBody);
    if (bodySchema) {
      problems.push(...this.#validate(this.#bodies, bodySchema, body, "body"));
    } else if (body !== undefined) problems.push("v4 takes no request body");
    return problems;
  }

  checkResponse(
    method: string,
    url: URL,
    status: number,
    json: unknown,
  ): string[] {
    const schema = this.#json(this.#find(method, url)?.op.responses[status]);
    if (!schema) return [];
    return this.#validate(this.#bodies, schema, json, `reply ${status}`);
  }

  #find(method: string, url: URL) {
    for (const { pattern, names, ops } of this.#paths) {
      const match = pattern.exec(url.pathname);
      const op = match && ops[method.toLowerCase()];
      if (op) {
        const path = names.map((n, i) => [n, match[i + 1]] as const);
        return { op, path };
      }
    }
  }

  #json(part: Content | Ref | undefined): object | undefined {
    if (part && "$ref" in part) {
      const [, kind, name] = part.$ref.replace("spec#/", "").split("/");
      part = this.#doc.components[kind][name] as Content;
    }
    return part?.content?.["application/json"]?.schema;
  }

  #validate(ajv: Ajv, schema: object | undefined, data: unknown, what: string) {
    if (!schema) return [`${what} is not in v4`];
    const validate = ajv.compile(schema);
    if (validate(data)) return [];
    return (validate.errors ?? []).map((e) =>
      `${what}${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`
    );
  }
}

/** A nullable $ref is spelled out, since OpenAPI ignores keywords beside a $ref and Ajv does not. */
function forAjv(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(forAjv);
  if (typeof node !== "object" || node === null) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = k === "$ref" && typeof v === "string" ? `spec${v}` : forAjv(v);
  }
  if (typeof out.$ref === "string" && out.nullable === true) {
    return { anyOf: [{ $ref: out.$ref }, { type: "null" }] };
  }
  return out;
}

export async function fakeShortcut(
  ws: FakeWorkspace,
): Promise<Disposable & { sent: Sent[] }> {
  const spec = await loadContract();
  const sent: Sent[] = [];
  const violations: string[] = [];

  const workflowById = (id: number) => {
    const wf = ws.workflows.find((w) => w.id === id);
    if (!wf) throw new Error(`fixture has no workflow ${id}`);
    return wf;
  };
  const slim = (id: number) => {
    const wf = workflowById(id);
    return {
      entity_type: "workflow:slim",
      id,
      name: wf.name,
      uri: `${API}/${SLUG}/workflows/${id}`,
    };
  };
  const defaultState = (wf: FakeWorkspace["workflows"][number]) => {
    const state = wf.states.find(([id]) => id === wf.defaultState);
    if (!state) {
      throw new Error(
        `fixture workflow ${wf.id} has no state ${wf.defaultState}`,
      );
    }
    const [id, name] = state;
    return {
      entity_type: "workflow-state:slim",
      id,
      name,
      uri: `${API}/${SLUG}/workflow-states/${id}`,
      workflow_name: wf.name,
    };
  };
  const workflow = (wf: FakeWorkspace["workflows"][number]) => ({
    entity_type: "workflow",
    id: wf.id,
    name: wf.name,
    default_workflow_state: defaultState(wf),
  });
  const lists: Record<string, unknown[]> = {
    "/teams": (ws.teams ?? []).map((t) => ({
      entity_type: "team",
      id: t.id,
      name: t.name,
      mention_name: t.mention_name ?? null,
      default_workflow: t.workflow ? slim(t.workflow) : null,
    })),
    "/projects": (ws.projects ?? []).map((p) => ({
      entity_type: "project",
      id: p.id,
      name: p.name,
      workflow: p.workflow ? slim(p.workflow) : null,
    })),
    "/members": (ws.members ?? []).map((m) => ({
      entity_type: "member",
      id: m.id,
      email_address: m.email,
      disabled: false,
    })),
    "/custom-fields": (ws.customFields ?? []).map((f) => ({
      entity_type: "custom-field",
      field_type: "enum",
      ...f,
      values: f.values.map((v) => ({
        entity_type: "custom-field-value",
        ...v,
      })),
    })),
    "/workflows": ws.workflows.map(workflow),
  };
  for (const t of ws.teams ?? []) {
    const ids = t.workflows ?? (t.workflow ? [t.workflow] : []);
    lists[`/teams/${t.id}/workflows`] = ids.map((id) =>
      workflow(workflowById(id))
    );
  }
  for (const wf of ws.workflows) {
    lists[`/workflows/${wf.id}/states`] = wf.states.map(([id, name]) => ({
      entity_type: "workflow-state",
      id,
      name,
    }));
  }

  const page = (path: string, url: URL) => {
    const all = lists[path];
    const start = Number(url.searchParams.get("cursor") ?? 0);
    const end = start + PAGE_SIZE;
    const entities = all.slice(start, end);
    const next = end < all.length
      ? { next_page_url: `${url.origin}${url.pathname}?cursor=${end}` }
      : {};
    return {
      $schema: `${API}/schemas/list`,
      entities,
      current_items: entities.length,
      current_page: start / PAGE_SIZE + 1,
      total_items: all.length,
      total_pages: Math.ceil(all.length / PAGE_SIZE),
      ...next,
    };
  };
  const entity = (value: unknown) => ({
    $schema: `${API}/schemas/entity`,
    entity: value,
  });

  const reply = (method: string, path: string, url: URL, body: unknown) => {
    if (method === "GET" && path === "/whoami") {
      const wf = workflowById(ws.defaultWorkflow);
      return [
        200,
        entity({
          entity_type: "whoami",
          workspace: {
            entity_type: "workspace:slim",
            id: "00000000-0000-4000-8000-000000000ac3",
            name: "Acme",
            slug: SLUG,
            app_url: `https://app.shortcut.com/${SLUG}`,
          },
          default_workflow: slim(wf.id),
          default_workflow_state: defaultState(wf),
          authorization: { scopes: ws.scopes ?? ["read", "write"] },
          member: {
            entity_type: "member",
            id: "11110000-0000-4000-8000-0000000000aa",
            name: "Alex Doe",
            mention_name: "alex",
            role: ws.tokenRole ?? "member",
          },
        }),
      ] as const;
    }
    if (method === "GET" && lists[path]) return [200, page(path, url)] as const;
    const wf = ws.workflows.find((w) => path === `/workflows/${w.id}`);
    if (method === "GET" && wf) return [200, entity(workflow(wf))] as const;
    if (method === "POST" && path === "/stories") {
      return [
        201,
        entity({
          entity_type: "story",
          id: 123,
          name: (body as { name: string }).name,
          app_url: `https://app.shortcut.com/${SLUG}/story/123`,
        }),
      ] as const;
    }
    const story = /^\/stories\/(\d+)\/comments$/.exec(path)?.[1];
    if (method === "POST" && story) {
      return [
        201,
        entity({
          entity_type: "comment",
          id: 9,
          text: (body as { text: string }).text,
          app_url: `https://app.shortcut.com/${SLUG}/story/${story}#activity-9`,
        }),
      ] as const;
    }
    violations.push(`the fake has no reply for ${method} ${path}`);
    return [500, {}] as const;
  };

  const shortcut = (method: string, url: URL, body: unknown): Response => {
    const prefix = url.pathname === "/api/v4/whoami"
      ? "/api/v4"
      : `/api/v4/${SLUG}`;
    if (!url.pathname.startsWith(prefix)) {
      violations.push(`request outside workspace ${SLUG}: ${url.pathname}`);
    }
    const path = url.pathname.slice(prefix.length);
    sent.push({
      method,
      path: path + url.search,
      ...(body === undefined ? {} : { body }),
    });
    const problems = spec.checkRequest(method, url, body);
    if (problems.length) {
      throw new Error(
        [`${method} ${path} breaks the v4 contract:`, ...problems].join("\n"),
      );
    }
    const failure = ws.failures?.[`${method} ${path}${url.search}`];
    if (failure === "network") throw dropped;
    const [status, json] = failure
      ? [failure, {}]
      : reply(method, path, url, body);
    violations.push(...spec.checkResponse(method, url, status, json));
    return Response.json(json, { status });
  };

  const slack = (body: URLSearchParams): Response => {
    const id = body.get("user") ?? "";
    const user = ws.slackUsers?.[id];
    return Response.json(
      user
        ? {
          ok: true,
          user: {
            id,
            name: user.name.toLowerCase(),
            profile: { real_name: user.name, email: user.email },
          },
        }
        : { ok: false, error: "user_not_found" },
    );
  };

  const fetchStub = stub(
    globalThis,
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      if (url.href === "https://slack.com/api/users.info") {
        return Promise.resolve(slack(new URLSearchParams(String(init?.body))));
      }
      if (url.host !== "api.app.shortcut.com") {
        violations.push(`unexpected request to ${url.host}`);
        return Promise.reject(new Error(`unexpected request to ${url.host}`));
      }
      const body = typeof init?.body === "string"
        ? JSON.parse(init.body)
        : undefined;
      try {
        return Promise.resolve(shortcut(method, url, body));
      } catch (e) {
        if (e !== dropped) violations.push(String(e));
        return Promise.reject(e);
      }
    },
  );

  return {
    sent,
    [Symbol.dispose]() {
      fetchStub.restore();
      if (violations.length) throw new Error(violations.join("\n"));
    },
  };
}
