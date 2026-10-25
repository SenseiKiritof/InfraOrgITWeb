import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type {
  DiagramEdge,
  DiagramNode,
  DiagramNodeType,
  Topology,
} from "./diagrams";

export interface GraphNodeData extends Record<string, unknown> {
  label: string;
  nodeType: DiagramNodeType;
  entityId: number;
  environmentId: number;
}

export interface GraphEdgeData extends Record<string, unknown> {
  proxyConnectionId: number;
  targetNodeType: DiagramNodeType;
  targetEntityId: number;
  sourceHandle: string | null;
  targetHandle: string | null;
  bendX: number | null;
  bendY: number | null;
}

export function nodeKey(nodeType: DiagramNodeType, entityId: number): string {
  return `${nodeType}:${entityId}`;
}

export function edgeKey(
  proxyConnectionId: number,
  targetNodeType: DiagramNodeType,
  targetEntityId: number,
): string {
  return `${proxyConnectionId}:${targetNodeType}:${targetEntityId}`;
}

export function buildGraph(
  topology: Topology,
  savedNodes: DiagramNode[] = [],
  savedEdges: DiagramEdge[] = [],
): { nodes: Node<GraphNodeData>[]; edges: Edge<GraphEdgeData>[] } {
  const savedByKey = new Map(
    savedNodes.map((node) => [nodeKey(node.nodeType, node.entityId), node]),
  );
  const nodes: Node<GraphNodeData>[] = [];

  const addNode = (
    nodeType: DiagramNodeType,
    entityId: number,
    label: string,
    x: number,
    y: number,
    environmentId: number,
  ) => {
    const saved = savedByKey.get(nodeKey(nodeType, entityId));
    nodes.push({
      id: nodeKey(nodeType, entityId),
      position: { x: saved?.x ?? x, y: saved?.y ?? y },
      data: { label, nodeType, entityId, environmentId },
      style: {
        width: saved?.width ?? 190,
        borderWidth: 2,
        borderColor: colors[nodeType],
        borderRadius: 8,
        padding: 6,
        fontSize: 12,
        whiteSpace: "pre-line",
        background: backgrounds[nodeType],
      },
    });
  };

  let cursorY = 0;
  for (const provider of topology.providers) {
    addNode("Provider", provider.id, provider.name, 0, cursorY, 0);

    let environmentY = cursorY;
    for (const environment of provider.environments) {
      addNode(
        "ProviderEnvironment",
        environment.id,
        environment.environmentName,
        260,
        environmentY,
        environment.id,
      );

      let serverY = environmentY;
      for (const server of environment.servers) {
        addNode(
          "Server",
          server.id,
          `${server.name}\n${server.ipAddress}`,
          520,
          serverY,
          environment.id,
        );

        let applicationY = serverY;
        for (const application of server.applications) {
          addNode(
            "ServerApplication",
            application.id,
            `${application.applicationName} ${application.versionNumber}\n:${application.exposedPort}`,
            780,
            applicationY,
            environment.id,
          );
          applicationY += 80;
        }

        serverY += Math.max(80, applicationY - serverY + 10);
      }

      environmentY += Math.max(80, serverY - environmentY + 20);
    }

    cursorY = environmentY + 40;
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const savedEdgeByKey = new Map(
    savedEdges.map((edge) => [
      edgeKey(edge.proxyConnectionId, edge.targetNodeType, edge.targetEntityId),
      edge,
    ]),
  );

  const groups = new Map<
    string,
    {
      connectionId: number;
      sourceServerId: number;
      direction: "Outgoing" | "Incoming";
      targetNodeType: DiagramNodeType;
      targetEntityId: number;
      labels: string[];
    }
  >();

  for (const connection of topology.proxyConnections) {
    if (!nodeIds.has(nodeKey("Server", connection.sourceServerId))) continue;

    const routes =
      connection.routes.length > 0
        ? connection.routes
        : [
            {
              id: 0,
              route: "",
              mappedTo: null,
              targetServerApplicationId: null,
            },
          ];

    for (const route of routes) {
      const targetNodeType: DiagramNodeType = route.targetServerApplicationId
        ? "ServerApplication"
        : "Server";
      const targetEntityId =
        route.targetServerApplicationId ?? connection.targetServerId;
      if (!nodeIds.has(nodeKey(targetNodeType, targetEntityId))) continue;

      const key = edgeKey(connection.id, targetNodeType, targetEntityId);
      const current = groups.get(key) ?? {
        connectionId: connection.id,
        sourceServerId: connection.sourceServerId,
        direction: connection.direction,
        targetNodeType,
        targetEntityId,
        labels: [],
      };
      if (route.route)
        current.labels.push(
          route.mappedTo ? `${route.route} → ${route.mappedTo}` : route.route,
        );
      groups.set(key, current);
    }
  }

  const edges: Edge<GraphEdgeData>[] = [...groups.entries()].map(
    ([key, group]) => {
      const saved = savedEdgeByKey.get(key);
      return {
        id: key,
        source: nodeKey("Server", group.sourceServerId),
        target: nodeKey(group.targetNodeType, group.targetEntityId),
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed },
        label: group.labels.join(", "),
        sourceHandle: saved?.sourceHandle ?? undefined,
        targetHandle: saved?.targetHandle ?? undefined,
        data: {
          proxyConnectionId: group.connectionId,
          targetNodeType: group.targetNodeType,
          targetEntityId: group.targetEntityId,
          sourceHandle: saved?.sourceHandle ?? null,
          targetHandle: saved?.targetHandle ?? null,
          bendX: saved?.bendX ?? null,
          bendY: saved?.bendY ?? null,
        },
        style:
          group.direction === "Incoming"
            ? { stroke: "#64748b", strokeDasharray: "6 4" }
            : { stroke: "#0f172a" },
      };
    },
  );

  return { nodes, edges };
}

const colors: Record<DiagramNodeType, string> = {
  Provider: "#7c3aed",
  ProviderEnvironment: "#2563eb",
  Server: "#475569",
  ServerApplication: "#059669",
};

const backgrounds: Record<DiagramNodeType, string> = {
  Provider: "#f5f3ff",
  ProviderEnvironment: "#eff6ff",
  Server: "#f8fafc",
  ServerApplication: "#ecfdf5",
};
