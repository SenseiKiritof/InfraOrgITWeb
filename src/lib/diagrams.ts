import { apiFetch } from "./api";
import type { Paged } from "./inventory";
import { paged } from "./inventory";

export interface TopologyProject {
  id: number;
  name: string;
}

export interface TopologyApplication {
  id: number;
  applicationVersionId: number;
  applicationName: string;
  versionNumber: string;
  exposedPort: number;
  projects: TopologyProject[];
}

export interface TopologyServer {
  id: number;
  name: string;
  ipAddress: string;
  hostname: string;
  applications: TopologyApplication[];
  projects: TopologyProject[];
}

export interface TopologyEnvironment {
  id: number;
  environmentId: number;
  environmentName: string;
  servers: TopologyServer[];
  projects: TopologyProject[];
}

export interface TopologyProvider {
  id: number;
  name: string;
  environments: TopologyEnvironment[];
  projects: TopologyProject[];
}

export interface TopologyProxyRoute {
  id: number;
  route: string;
  mappedTo: string | null;
  targetServerApplicationId: number | null;
  virtualHost: string | null;
  listenPort: number | null;
}

export interface TopologyProxyConnection {
  id: number;
  sourceServerId: number;
  targetServerId: number;
  direction: "Outgoing" | "Incoming";
  projects: TopologyProject[];
  routes: TopologyProxyRoute[];
}

export interface Topology {
  providers: TopologyProvider[];
  proxyConnections: TopologyProxyConnection[];
}

export type DiagramScopeType = "Provider" | "ProviderEnvironment" | "Project";

export type DiagramNodeType =
  | "Provider"
  | "ProviderEnvironment"
  | "Server"
  | "ServerApplication";

export interface DiagramScopeItem {
  scopeType: DiagramScopeType;
  entityId: number;
}

export interface Diagram {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  scopeItems: DiagramScopeItem[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface DiagramNode {
  nodeType: DiagramNodeType;
  entityId: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: boolean;
}

export interface DiagramEdge {
  proxyConnectionId: number;
  targetNodeType: DiagramNodeType;
  targetEntityId: number;
  sourceHandle: string | null;
  targetHandle: string | null;
  bendX: number | null;
  bendY: number | null;
}

export interface DiagramGraph {
  diagram: Diagram;
  topology: Topology;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  canWrite: boolean;
}

export interface DiagramInput {
  name: string;
  description: string | null;
  isDefault: boolean;
  scopeItems: DiagramScopeItem[];
}

export interface DeletePreview {
  environments: number;
  servers: string[];
  applications: string[];
  proxyConnections: number;
  proxyRoutes: number;
  routesLosingTarget: number;
  groupRoles: number;
}

export function getDiagrams(q?: string): Promise<Paged<Diagram>> {
  return paged<Diagram>("/api/diagrams", q);
}

export function getDiagram(id: number): Promise<Diagram> {
  return apiFetch<Diagram>(`/api/diagrams/${id}`);
}

export function getDefaultDiagram(): Promise<Diagram> {
  return apiFetch<Diagram>("/api/diagrams/default");
}

export function createDiagram(
  input: DiagramInput,
  csrfToken: string,
): Promise<Diagram> {
  return apiFetch<Diagram>(
    "/api/diagrams",
    { method: "POST", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function updateDiagram(
  id: number,
  input: DiagramInput,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/diagrams/${id}`,
    { method: "PUT", body: JSON.stringify(input) },
    csrfToken,
  );
}

export function deleteDiagram(id: number, csrfToken: string): Promise<void> {
  return apiFetch<void>(`/api/diagrams/${id}`, { method: "DELETE" }, csrfToken);
}

export function getGraph(id: number): Promise<DiagramGraph> {
  return apiFetch<DiagramGraph>(`/api/diagrams/${id}/graph`);
}

export function saveNodes(
  id: number,
  nodes: DiagramNode[],
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/diagrams/${id}/nodes`,
    { method: "PUT", body: JSON.stringify(nodes) },
    csrfToken,
  );
}

export function saveEdges(
  id: number,
  edges: DiagramEdge[],
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/diagrams/${id}/edges`,
    { method: "PUT", body: JSON.stringify(edges) },
    csrfToken,
  );
}

export function getDeletePreview(
  nodeType: DiagramNodeType,
  id: number,
): Promise<DeletePreview> {
  return apiFetch<DeletePreview>(
    `/api/topology/nodes/${nodeType}/${id}/delete-preview`,
  );
}

export function deleteTopologyNode(
  nodeType: DiagramNodeType,
  id: number,
  csrfToken: string,
): Promise<void> {
  return apiFetch<void>(
    `/api/topology/nodes/${nodeType}/${id}`,
    { method: "DELETE" },
    csrfToken,
  );
}
