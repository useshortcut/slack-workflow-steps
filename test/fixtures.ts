import type { FakeWorkspace } from "./fake_shortcut.ts";

export const env = { SHORTCUT_API_TOKEN: "sct_rw_acme_0123456789" };

export const INFRA = "5f2c0000-0000-4000-8000-000000000001";
export const WEB = "5f2c0000-0000-4000-8000-000000000002";
export const PLATFORM_A = "5f2c0000-0000-4000-8000-00000000000a";
export const PLATFORM_B = "5f2c0000-0000-4000-8000-00000000000b";
export const JO = "11110000-0000-4000-8000-000000000001";
export const SAM = "11110000-0000-4000-8000-000000000002";
export const PRIORITY = "22220000-0000-4000-8000-000000000001";
export const HIGH = "22220000-0000-4000-8000-000000000012";

/**
 * Workflow states are numbered by workflow: Engineering 50x, Design 60x,
 * Infrastructure 70x. "Ready for Dev" and "Done" exist in more than one.
 */
export const acme: FakeWorkspace = {
  workflows: [
    {
      id: 1,
      name: "Engineering",
      states: [
        [500, "Unstarted"],
        [501, "Ready for Dev"],
        [502, "In Progress"],
        [503, "Done"],
      ],
    },
    {
      id: 2,
      name: "Design",
      states: [[600, "Backlog"], [601, "Ready for Review"], [602, "Done"]],
    },
    {
      id: 3,
      name: "Infrastructure",
      states: [[700, "Inbox"], [701, "Ready for Dev"], [702, "Done"]],
    },
  ],
  teams: [
    { id: INFRA, name: "Infra", mention_name: "infra", workflow: 3 },
    { id: WEB, name: "Web", mention_name: null, workflow: 1 },
    { id: PLATFORM_A, name: "Platform", workflow: 1 },
    { id: PLATFORM_B, name: "Platform", workflow: 1 },
  ],
  projects: [
    { id: 10, name: "Website", workflow: 2 },
    { id: 11, name: "API" },
    { id: 12, name: "Billing", workflow: 1 },
  ],
  members: [
    { id: "11110000-0000-4000-8000-000000000003", email: null },
    { id: JO, email: "jo@acme.com" },
    { id: SAM, email: "sam@acme.com" },
  ],
  customFields: [
    {
      id: "22220000-0000-4000-8000-000000000002",
      name: "Severity",
      canonical_name: "severity",
      enabled: true,
      values: [],
    },
    {
      id: PRIORITY,
      name: "Priority",
      canonical_name: "priority",
      enabled: true,
      values: [
        {
          id: "22220000-0000-4000-8000-000000000011",
          value: "Highest",
          enabled: true,
        },
        { id: HIGH, value: "High", enabled: true },
        {
          id: "22220000-0000-4000-8000-000000000013",
          value: "Medium",
          enabled: true,
        },
        {
          id: "22220000-0000-4000-8000-000000000014",
          value: "Low",
          enabled: true,
        },
        {
          id: "22220000-0000-4000-8000-000000000015",
          value: "Urgent",
          enabled: false,
        },
      ],
    },
  ],
  slackUsers: {
    U_JO: { name: "Jo Park", email: "Jo@Acme.com" },
    U_SAM: { name: "Sam Lee", email: "sam@acme.com" },
    U_PAT: { name: "Pat Kim", email: "pat@elsewhere.com" },
    U_BOT: { name: "Deploy Bot" },
  },
};
