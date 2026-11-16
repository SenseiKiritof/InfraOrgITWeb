import { describe, expect, it } from "vitest";
import {
  draftFromAgent,
  type McpAgent,
  permissionsFromDraft,
} from "./mcpAgents";

const agent: McpAgent = {
  id: 1,
  userId: 2,
  username: "mario",
  clientKey: "token:3",
  name: "Claude",
  status: "Approved",
  createdAt: "2026-01-01T00:00:00Z",
  approvedAt: "2026-01-01T00:00:00Z",
  approvedByUsername: "mario",
  lastSeenAt: null,
  pendingRequests: 0,
  permissions: [
    {
      id: 10,
      action: "reachability.run",
      environmentDefinitionId: 7,
      environmentName: "Produzione",
    },
  ],
};

describe("mcp agent permission drafts", () => {
  it("maps stored permissions to checkboxes", () => {
    const draft = draftFromAgent(agent);
    expect(draft["reachability.run"]).toEqual({
      enabled: true,
      environmentDefinitionId: 7,
    });
    expect(draft["actions.run"]).toEqual({
      enabled: false,
      environmentDefinitionId: null,
    });
  });

  it("expands a wildcard permission to every action", () => {
    const draft = draftFromAgent({
      ...agent,
      permissions: [
        {
          id: 11,
          action: "*",
          environmentDefinitionId: null,
          environmentName: null,
        },
      ],
    });
    expect(draft["reachability.run"].enabled).toBe(true);
    expect(draft["actions.run"].enabled).toBe(true);
  });

  it("serializes only enabled permissions", () => {
    const draft = draftFromAgent(agent);
    draft["actions.run"] = { enabled: true, environmentDefinitionId: null };
    expect(permissionsFromDraft(draft)).toEqual([
      { action: "reachability.run", environmentDefinitionId: 7 },
      { action: "actions.run", environmentDefinitionId: null },
    ]);
  });
});
