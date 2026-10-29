import type { Node } from "@xyflow/react";
import { type GraphNodeData, nodeKey } from "./buildGraph";
import type { DiagramNode, DiagramNodeType } from "./diagrams";
import { getLanguage, translate } from "./i18n";

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

export function addedSummary(
  nodes: AddedDiagramNode[],
  language = getLanguage(),
): string {
  const t = (
    key: Parameters<typeof translate>[1],
    params?: Record<string, string | number>,
  ) => translate(language, key, params);
  const servers = nodes.filter((node) => node.nodeType === "Server").length;
  const applications = nodes.filter(
    (node) => node.nodeType === "ServerApplication",
  ).length;
  const parts: string[] = [];
  if (servers > 0) {
    parts.push(
      `${servers} ${
        servers === 1 ? t("diagrams.newServer") : t("diagrams.newServers")
      }`,
    );
  }
  if (applications > 0) {
    parts.push(
      `${applications} ${
        applications === 1
          ? t("diagrams.newApplication")
          : t("diagrams.newApplications")
      }`,
    );
  }
  if (parts.length === 0) {
    return t("diagrams.addedNodes", {
      count: nodes.length,
      nodes: nodes.length === 1 ? t("diagrams.node") : t("diagrams.nodes"),
    });
  }
  return t("diagrams.added", { parts: parts.join(t("diagrams.partsJoin")) });
}

export function addedTypeLabel(
  type: DiagramNodeType,
  language = getLanguage(),
): string {
  switch (type) {
    case "Server":
      return "Server";
    case "ServerApplication":
      return translate(language, "common.application");
    case "ProviderEnvironment":
      return translate(language, "common.environment");
    default:
      return "Provider";
  }
}
