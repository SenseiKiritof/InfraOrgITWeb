import type { Node } from "@xyflow/react";
import { type GraphNodeData, nodeKey } from "./buildGraph";
import type { DiagramNode, DiagramNodeType } from "./diagrams";

export interface AddedDiagramNode {
  nodeType: DiagramNodeType;
  entityId: number;
  label: string;
}

/** Nodi presenti nella topologia ma non ancora salvati nel diagramma. */
export function addedDiagramNodes(
  built: Node<GraphNodeData>[],
  saved: DiagramNode[],
): AddedDiagramNode[] {
  const savedKeys = new Set(
    saved.map((node) => nodeKey(node.nodeType, node.entityId)),
  );
  const added: AddedDiagramNode[] = [];
  for (const node of built) {
    const data = node.data;
    if (!data || savedKeys.has(nodeKey(data.nodeType, data.entityId))) continue;
    added.push({
      nodeType: data.nodeType,
      entityId: data.entityId,
      label: data.label,
    });
  }
  return added;
}

export function addedSummary(nodes: AddedDiagramNode[]): string {
  const servers = nodes.filter((node) => node.nodeType === "Server").length;
  const applications = nodes.filter(
    (node) => node.nodeType === "ServerApplication",
  ).length;
  const parts: string[] = [];
  if (servers > 0) {
    parts.push(`${servers} ${servers === 1 ? "nuovo server" : "nuovi server"}`);
  }
  if (applications > 0) {
    parts.push(
      `${applications} ${applications === 1 ? "nuova applicazione" : "nuove applicazioni"}`,
    );
  }
  if (parts.length === 0) {
    return `Aggiunti ${nodes.length} ${nodes.length === 1 ? "nodo" : "nodi"} al diagramma.`;
  }
  return `Aggiunti ${parts.join(" e ")} al diagramma.`;
}

export function addedTypeLabel(type: DiagramNodeType): string {
  switch (type) {
    case "Server":
      return "Server";
    case "ServerApplication":
      return "Applicazione";
    case "ProviderEnvironment":
      return "Ambiente";
    default:
      return "Provider";
  }
}
