import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { GraphNodeData } from "./buildGraph";
import {
  addedDiagramNodes,
  addedSummary,
  addedTypeLabel,
} from "./diagramChanges";

const node = (
  nodeType: GraphNodeData["nodeType"],
  entityId: number,
  label: string,
): Node<GraphNodeData> => ({
  id: `${nodeType}:${entityId}`,
  data: {
    label,
    nodeType,
    entityId,
    environmentId: 1,
    projects: [],
  },
  position: { x: 0, y: 0 },
});

describe("diagramChanges", () => {
  it("elenca solo i nodi non ancora salvati", () => {
    const built = [
      node("Provider", 1, "Provider A"),
      node("Server", 7, "ws1 (10.0.0.1)"),
      node("ServerApplication", 9, "app 1.0"),
    ];
    const saved = [
      {
        nodeType: "Provider" as const,
        entityId: 1,
        x: 0,
        y: 0,
        width: null,
        height: null,
        collapsed: false,
      },
    ];

    expect(addedDiagramNodes(built, saved)).toEqual([
      { nodeType: "Server", entityId: 7, label: "ws1 (10.0.0.1)" },
      { nodeType: "ServerApplication", entityId: 9, label: "app 1.0" },
    ]);
  });

  it("riassume server e applicazioni aggiunti", () => {
    expect(
      addedSummary([
        { nodeType: "Server", entityId: 1, label: "a" },
        { nodeType: "Server", entityId: 2, label: "b" },
        { nodeType: "ServerApplication", entityId: 3, label: "app" },
      ]),
    ).toBe("Aggiunti 2 nuovi server e 1 nuova applicazione al diagramma.");

    expect(
      addedSummary([{ nodeType: "Provider", entityId: 1, label: "p" }]),
    ).toBe("Aggiunti 1 nodo al diagramma.");
  });

  it("etichetta i tipi di nodo", () => {
    expect(addedTypeLabel("Server")).toBe("Server");
    expect(addedTypeLabel("ServerApplication")).toBe("Applicazione");
    expect(addedTypeLabel("ProviderEnvironment")).toBe("Ambiente");
  });
});
