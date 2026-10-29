import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Edge, Node } from "@xyflow/react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthProvider";
import { PageHeader } from "../../components/page";
import type { ApiError } from "../../lib/api";
import type { GraphEdgeData, GraphNodeData } from "../../lib/buildGraph";
import { buildGraph } from "../../lib/buildGraph";
import {
  type AddedDiagramNode,
  addedDiagramNodes,
  addedSummary,
  addedTypeLabel,
} from "../../lib/diagramChanges";
import type { DiagramEdge, DiagramNode } from "../../lib/diagrams";
import {
  createDiagram,
  deleteDiagram,
  deleteTopologyNode,
  getDefaultDiagram,
  getDeletePreview,
  getDiagram,
  getGraph,
  saveEdges,
  saveNodes,
} from "../../lib/diagrams";
import { useI18n } from "../../lib/i18n";
import { useServerAccess } from "../../lib/useServerAccess";
import { nodeTypes as graphNodeTypes } from "./GraphNodes";
import { edgeTypes as graphEdgeTypes } from "./ProxyEdge";

function toPayload(nodes: Node<GraphNodeData>[]): DiagramNode[] {
  return nodes.map((node) => {
    const data = node.data;
    if (!data) throw new Error("Node without data");
    const width =
      node.measured?.width ??
      (typeof node.style?.width === "number" ? node.style.width : null);
    const height =
      node.measured?.height ??
      (typeof node.style?.height === "number" ? node.style.height : null);
    return {
      nodeType: data.nodeType,
      entityId: data.entityId,
      x: node.position.x,
      y: node.position.y,
      width,
      height,
      collapsed: false,
    };
  });
}

export function DiagramPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const isDefault = id === "default";
  const numericId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const csrf = session?.csrfToken ?? "";
  const access = useServerAccess();
  const isSystemAdmin = access.data?.isSystemAdmin ?? false;
  const adminEnvironmentIds = access.data?.adminEnvironmentIds ?? [];
  const sectionRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === sectionRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void sectionRef.current?.requestFullscreen();
  };

  const diagramQuery = useQuery({
    queryKey: ["diagram", isDefault ? "default" : numericId],
    queryFn: isDefault ? getDefaultDiagram : () => getDiagram(numericId),
    enabled: isDefault || Number.isInteger(numericId),
    retry: false,
  });

  const graphQuery = useQuery({
    queryKey: ["diagram-graph", diagramQuery.data?.id],
    queryFn: () => {
      const diagram = diagramQuery.data;
      if (!diagram) throw new Error(t("diagrams.notLoaded"));
      return getGraph(diagram.id);
    },
    enabled: diagramQuery.data !== undefined,
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<GraphEdgeData>>(
    [],
  );
  const [selected, setSelected] = useState<GraphNodeData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedDiagramNode[] | null>(null);
  const [showAddedDetails, setShowAddedDetails] = useState(false);
  const synced = useRef<string | null>(null);

  useEffect(() => {
    if (!graphQuery.data) return;
    const graph = graphQuery.data;
    const built = buildGraph(graph.topology, graph.nodes, graph.edges);
    setNodes(built.nodes);
    setEdges(built.edges);

    const missing = addedDiagramNodes(built.nodes, graph.nodes);
    if (missing.length === 0 || graph.nodes.length === 0 || !graph.canWrite)
      return;

    const marker = `${graph.diagram.id}:${graphQuery.dataUpdatedAt}`;
    if (synced.current === marker) return;
    synced.current = marker;

    void saveNodes(graph.diagram.id, toPayload(built.nodes), csrf)
      .then(() => setAdded(missing))
      .catch(() => {
        // Salvataggio automatico non riuscito: il layout resta salvabile a mano.
      });
  }, [graphQuery.data, graphQuery.dataUpdatedAt, csrf, setNodes, setEdges]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("common.operationError"),
      );
    }
  };

  const save = () =>
    run(async () => {
      const graph = graphQuery.data;
      if (!graph) return;

      const payloadNodes = toPayload(nodes);

      const payloadEdges: DiagramEdge[] = edges.map((edge) => {
        const data = edge.data;
        if (!data) throw new Error(t("diagrams.edgeWithoutData"));
        return {
          proxyConnectionId: data.proxyConnectionId,
          targetNodeType: data.targetNodeType,
          targetEntityId: data.targetEntityId,
          sourceHandle: edge.sourceHandle ?? null,
          targetHandle: edge.targetHandle ?? null,
          bendX: data.bendX,
          bendY: data.bendY,
        };
      });

      await saveNodes(graph.diagram.id, payloadNodes, csrf);
      await saveEdges(graph.diagram.id, payloadEdges, csrf);
      setMessage(t("diagrams.layoutSaved"));
    });

  const saveAs = () =>
    run(async () => {
      const graph = graphQuery.data;
      if (!graph) return;
      const name = window.prompt(
        t("diagrams.newNamePrompt"),
        t("diagrams.copyName", { name: graph.diagram.name }),
      );
      if (!name) return;

      const created = await createDiagram(
        {
          name,
          description: graph.diagram.description,
          isDefault: false,
          scopeItems: graph.diagram.scopeItems,
        },
        csrf,
      );
      navigate(`/diagrams/${created.id}`);
    });

  const removeDiagram = () =>
    run(async () => {
      const graph = graphQuery.data;
      if (!graph) return;
      if (
        !window.confirm(
          t("diagrams.deleteConfirm", { name: graph.diagram.name }),
        )
      )
        return;
      await deleteDiagram(graph.diagram.id, csrf);
      navigate("/diagrams");
    });

  const removeNode = () =>
    run(async () => {
      if (!selected) return;
      const preview = await getDeletePreview(
        selected.nodeType,
        selected.entityId,
      );
      const detail = [
        t("diagrams.environmentCount", { count: preview.environments }),
        `${t("diagrams.serverCount", { count: preview.servers.length })}${
          preview.servers.length ? `: ${preview.servers.join(", ")}` : ""
        }`,
        `${t("diagrams.applicationCount", {
          count: preview.applications.length,
        })}${
          preview.applications.length
            ? `: ${preview.applications.join(", ")}`
            : ""
        }`,
        t("diagrams.proxyConnectionCount", {
          count: preview.proxyConnections,
        }),
        t("diagrams.routeCount", { count: preview.proxyRoutes }),
      ].join("\n");

      if (
        !window.confirm(
          `${t("diagrams.deleteNodeConfirm", {
            type: selected.nodeType,
            id: selected.entityId,
          })}\n${detail}`,
        )
      )
        return;

      await deleteTopologyNode(selected.nodeType, selected.entityId, csrf);
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ["diagram-graph"] });
    });

  const createDefault = () =>
    run(async () => {
      const created = await createDiagram(
        {
          name: t("diagrams.globalView"),
          description: null,
          isDefault: true,
          scopeItems: [],
        },
        csrf,
      );
      navigate(`/diagrams/${created.id}`);
    });

  const canDeleteNode = (node: GraphNodeData) => {
    if (node.nodeType === "Provider" || node.nodeType === "ProviderEnvironment")
      return isSystemAdmin;
    return adminEnvironmentIds.includes(node.environmentId);
  };

  const missingDefault =
    isDefault &&
    diagramQuery.isError &&
    (diagramQuery.error as ApiError).status === 404;

  if (missingDefault) {
    return (
      <section className="space-y-4">
        <PageHeader title={t("diagrams.globalView")} />
        <p className="text-sm text-slate-600">{t("diagrams.noDefault")}</p>
        {isSystemAdmin && (
          <button
            type="button"
            onClick={() => void createDefault()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {t("diagrams.createGlobal")}
          </button>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>
    );
  }

  if (diagramQuery.isError) {
    return (
      <section className="space-y-4">
        <PageHeader title={t("diagrams.detail")} />
        <p className="text-sm text-red-700">{t("diagrams.notFound")}</p>
        <Link to="/diagrams" className="text-sm underline">
          {t("diagrams.title")}
        </Link>
      </section>
    );
  }

  const diagram = graphQuery.data?.diagram;

  return (
    <section ref={sectionRef} className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        title={diagram?.name ?? t("diagrams.detail")}
        description={
          diagram?.isDefault ? t("diagrams.defaultGlobalView") : undefined
        }
      >
        <div className="flex flex-wrap gap-2">
          <Link
            to="/diagrams"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("diagrams.list")}
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            onClick={() => void saveAs()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {t("diagrams.saveAs")}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {isFullscreen
              ? t("diagrams.exitFullscreen")
              : t("diagrams.fullscreen")}
          </button>
          <button
            type="button"
            onClick={() => void removeDiagram()}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700"
          >
            {t("common.delete")}
          </button>
        </div>
      </PageHeader>

      {added && added.length > 0 && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <div className="flex flex-wrap items-center gap-2">
            <span>{addedSummary(added)}</span>
            <button
              type="button"
              onClick={() => setShowAddedDetails((value) => !value)}
              className="underline"
            >
              {showAddedDetails
                ? t("diagrams.hideDetails")
                : t("diagrams.details")}
            </button>
            <button
              type="button"
              aria-label={t("diagrams.dismissAdded")}
              onClick={() => {
                setAdded(null);
                setShowAddedDetails(false);
              }}
              className="ml-auto rounded px-1 text-emerald-800 hover:bg-emerald-100"
            >
              ×
            </button>
          </div>
          {showAddedDetails && (
            <ul className="mt-2 space-y-1 border-t border-emerald-200 pt-2 text-xs">
              {added.map((node) => (
                <li key={`${node.nodeType}:${node.entityId}`}>
                  <span className="font-medium">
                    {addedTypeLabel(node.nodeType)}
                  </span>
                  : {node.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {message && (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {graphQuery.isLoading ? (
          <p className="p-4 text-sm text-slate-500">{t("diagrams.loading")}</p>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={graphNodeTypes}
            edgeTypes={graphEdgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelected(node.data)}
            fitView
            nodesConnectable={false}
            minZoom={0.1}
            elevateNodesOnSelect
          >
            <Background color="var(--rf-dot)" />
            <MiniMap
              pannable
              zoomable
              nodeColor="var(--rf-minimap-node)"
              maskColor="var(--rf-minimap-mask)"
            />
            <Controls />
          </ReactFlow>
        )}
      </div>

      {selected && (
        <aside className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{selected.label}</p>
              <p className="text-slate-500">
                {selected.nodeType} #{selected.entityId}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm underline"
            >
              {t("common.close")}
            </button>
          </div>
          {canDeleteNode(selected) && (
            <button
              type="button"
              onClick={() => void removeNode()}
              className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700"
            >
              {t("diagrams.deleteNodeDependencies")}
            </button>
          )}
        </aside>
      )}
    </section>
  );
}
