import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type {
  DiagramEdge,
  DiagramNode,
  DiagramNodeType,
  Topology,
  TopologyApplication,
  TopologyEnvironment,
  TopologyProject,
  TopologyProvider,
  TopologyServer,
} from "./diagrams";

export interface GraphNodeData extends Record<string, unknown> {
  label: string;
  nodeType: DiagramNodeType;
  entityId: number;
  environmentId: number;
  projects: TopologyProject[];
  exposedPort?: number;
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

const APP_W = 170;
const APP_H = 70;
const PAD = 16;
const HEADER = 28;
const GAP = 12;
const MAX_ROW_W = 720;
const MIN_CONTAINER_W = 160;

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

interface Layout {
  rfNode: Node<GraphNodeData>;
  w: number;
  h: number;
  descendants: Node<GraphNodeData>[];
}

interface SavedBox {
  x: number;
  y: number;
  width: number | null;
  height: number | null;
}

function indexSaved(savedNodes: DiagramNode[]): Map<string, SavedBox> {
  return new Map(
    savedNodes.map((node) => [nodeKey(node.nodeType, node.entityId), node]),
  );
}

function packRows(
  children: { layout: Layout; x: number; y: number }[],
  maxRowW: number,
): { w: number; h: number } {
  let rowX = PAD;
  let rowY = HEADER + PAD;
  let rowH = 0;
  let contentW = PAD;

  for (const child of children) {
    if (rowX > PAD && rowX + child.layout.w > PAD + maxRowW) {
      rowY += rowH + GAP;
      rowX = PAD;
      rowH = 0;
    }
    child.x = rowX;
    child.y = rowY;
    rowX += child.layout.w + GAP;
    rowH = Math.max(rowH, child.layout.h);
    contentW = Math.max(contentW, rowX - GAP);
  }

  return { w: contentW + PAD, h: rowY + rowH + PAD };
}

function positionSaved(
  children: Layout[],
  saved: Map<string, SavedBox>,
): boolean {
  if (!children.every((child) => saved.has(child.rfNode.id))) return false;
  for (const child of children) {
    const box = saved.get(child.rfNode.id);
    if (!box) return false;
    child.rfNode.position = { x: box.x, y: box.y };
  }
  return true;
}

function layoutContainer(
  id: string,
  label: string,
  type: string,
  nodeType: DiagramNodeType,
  entityId: number,
  environmentId: number,
  children: Layout[],
  saved: Map<string, SavedBox>,
  projects: TopologyProject[],
  maxRowW = MAX_ROW_W,
  exposedPort?: number,
): Layout {
  const savedNode = saved.get(id);
  const placed = positionSaved(children, saved);
  const boxes = children.map((child) => ({ layout: child, x: 0, y: 0 }));

  if (!placed && boxes.length > 0) {
    packRows(boxes, maxRowW);
    boxes.forEach((box) => {
      box.layout.rfNode.position = { x: box.x, y: box.y };
    });
  }

  const contentW = children.reduce(
    (max, child) => Math.max(max, child.rfNode.position.x + child.w + PAD),
    MIN_CONTAINER_W,
  );
  const contentH = children.reduce(
    (max, child) => Math.max(max, child.rfNode.position.y + child.h + PAD),
    HEADER + PAD * 2,
  );
  const width = Math.max(savedNode?.width ?? 0, contentW);
  const height = Math.max(savedNode?.height ?? 0, contentH);

  const rfNode: Node<GraphNodeData> = {
    id,
    type,
    data: {
      label,
      nodeType,
      entityId,
      environmentId,
      projects,
      exposedPort,
    },
    position: savedNode ? { x: savedNode.x, y: savedNode.y } : { x: 0, y: 0 },
    style: {
      width,
      height,
      zIndex: nodeType === "ServerApplication" ? 1 : 0,
    },
  };

  children.forEach((child) => {
    child.rfNode.parentId = id;
  });

  return {
    rfNode,
    w: width,
    h: height,
    descendants: children.flatMap((child) => [
      child.rfNode,
      ...child.descendants,
    ]),
  };
}

function layoutApplication(
  application: TopologyApplication,
  environmentId: number,
  saved: Map<string, SavedBox>,
): Layout {
  const id = nodeKey("ServerApplication", application.id);
  const box = saved.get(id);
  const width = box?.width ?? APP_W;
  const height = box?.height ?? APP_H;
  const rfNode: Node<GraphNodeData> = {
    id,
    type: "ApplicationNode",
    data: {
      label:
        `${application.applicationName} ${application.versionNumber}`.trim(),
      nodeType: "ServerApplication",
      entityId: application.id,
      environmentId,
      projects: application.projects,
      exposedPort: application.exposedPort,
    },
    position: box ? { x: box.x, y: box.y } : { x: 0, y: 0 },
    style: { width, height, zIndex: 1 },
  };
  return { rfNode, w: width, h: height, descendants: [] };
}

function layoutServer(
  server: TopologyServer,
  environmentId: number,
  saved: Map<string, SavedBox>,
): Layout {
  const applications = server.applications.map((application) =>
    layoutApplication(application, environmentId, saved),
  );
  return layoutContainer(
    nodeKey("Server", server.id),
    `${server.name} (${server.ipAddress})`,
    "ServerNode",
    "Server",
    server.id,
    environmentId,
    applications,
    saved,
    server.projects,
  );
}

function layoutEnvironment(
  environment: TopologyEnvironment,
  saved: Map<string, SavedBox>,
): Layout {
  const servers = environment.servers.map((server) =>
    layoutServer(server, environment.id, saved),
  );
  return layoutContainer(
    nodeKey("ProviderEnvironment", environment.id),
    environment.environmentName,
    "EnvironmentNode",
    "ProviderEnvironment",
    environment.id,
    environment.id,
    servers,
    saved,
    environment.projects,
  );
}

function layoutProvider(
  provider: TopologyProvider,
  saved: Map<string, SavedBox>,
): Layout {
  const environments = provider.environments.map((environment) =>
    layoutEnvironment(environment, saved),
  );
  return layoutContainer(
    nodeKey("Provider", provider.id),
    provider.name,
    "ProviderNode",
    "Provider",
    provider.id,
    0,
    environments,
    saved,
    provider.projects,
    Number.POSITIVE_INFINITY,
  );
}

function absoluteCenter(
  node: Node<GraphNodeData>,
  byId: Map<string, Node<GraphNodeData>>,
): { cx: number; cy: number } {
  let x = node.position.x;
  let y = node.position.y;
  let parent = node.parentId ? byId.get(node.parentId) : undefined;
  while (parent) {
    x += parent.position.x;
    y += parent.position.y;
    parent = parent.parentId ? byId.get(parent.parentId) : undefined;
  }
  const width = typeof node.style?.width === "number" ? node.style.width : 0;
  const height = typeof node.style?.height === "number" ? node.style.height : 0;
  return { cx: x + width / 2, cy: y + height / 2 };
}

function nearestSides(
  source: { cx: number; cy: number },
  target: { cx: number; cy: number },
): { source: string; target: string } {
  const dx = target.cx - source.cx;
  const dy = target.cy - source.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { source: "right", target: "left" }
      : { source: "left", target: "right" };
  }
  return dy >= 0
    ? { source: "bottom", target: "top" }
    : { source: "top", target: "bottom" };
}

const SOURCE_HANDLE = /^s-(top|right|bottom|left)$/;
const TARGET_HANDLE = /^t-(top|right|bottom|left)$/;

export function buildGraph(
  topology: Topology,
  savedNodes: DiagramNode[] = [],
  savedEdges: DiagramEdge[] = [],
): { nodes: Node<GraphNodeData>[]; edges: Edge<GraphEdgeData>[] } {
  const saved = indexSaved(savedNodes);
  const providerLayouts = topology.providers.map((provider) =>
    layoutProvider(provider, saved),
  );

  const nodes: Node<GraphNodeData>[] = [];
  let providerX = 0;
  for (const provider of providerLayouts) {
    if (!saved.has(provider.rfNode.id)) {
      provider.rfNode.position = { x: providerX, y: 0 };
      providerX += provider.w + GAP * 8;
    }
    nodes.push(provider.rfNode, ...provider.descendants);
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
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
    if (!byId.has(nodeKey("Server", connection.sourceServerId))) continue;

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
      if (!byId.has(nodeKey(targetNodeType, targetEntityId))) continue;

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

  const edges: Edge<GraphEdgeData>[] = [...groups.entries()]
    .map(([key, group]): Edge<GraphEdgeData> | null => {
      const sourceId = nodeKey("Server", group.sourceServerId);
      const targetId = nodeKey(group.targetNodeType, group.targetEntityId);
      const sourceNode = byId.get(sourceId);
      const targetNode = byId.get(targetId);
      if (!sourceNode || !targetNode) return null;
      const sides = nearestSides(
        absoluteCenter(sourceNode, byId),
        absoluteCenter(targetNode, byId),
      );
      const savedEdge = savedEdgeByKey.get(key);
      const savedSource = savedEdge?.sourceHandle;
      const savedTarget = savedEdge?.targetHandle;
      const sourceHandle =
        savedSource && SOURCE_HANDLE.test(savedSource)
          ? savedSource
          : `s-${sides.source}`;
      const targetHandle =
        savedTarget && TARGET_HANDLE.test(savedTarget)
          ? savedTarget
          : `t-${sides.target}`;
      const stroke =
        group.direction === "Incoming"
          ? "var(--edge-incoming)"
          : "var(--edge-outgoing)";
      const shown = group.labels.slice(0, 3);
      const extra = group.labels.length - shown.length;
      const label =
        `${shown.join(", ")}${extra > 0 ? ` +${extra}` : ""}` ||
        group.direction;

      return {
        id: key,
        source: sourceId,
        target: targetId,
        type: "proxy",
        zIndex: 1500,
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
        label,
        sourceHandle,
        targetHandle,
        style: {
          stroke,
          strokeDasharray: group.direction === "Incoming" ? "6 4" : undefined,
        },
        data: {
          proxyConnectionId: group.connectionId,
          targetNodeType: group.targetNodeType,
          targetEntityId: group.targetEntityId,
          sourceHandle: savedEdge?.sourceHandle ?? null,
          targetHandle: savedEdge?.targetHandle ?? null,
          bendX: savedEdge?.bendX ?? null,
          bendY: savedEdge?.bendY ?? null,
        },
      };
    })
    .filter((edge): edge is Edge<GraphEdgeData> => edge !== null);

  return { nodes, edges };
}
