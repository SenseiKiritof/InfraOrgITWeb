import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Edge, Node } from "@xyflow/react";
import {
  Background,
  Controls,
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
import { useServerAccess } from "../../lib/useServerAccess";
import { nodeTypes as graphNodeTypes } from "./GraphNodes";
import { edgeTypes as graphEdgeTypes } from "./ProxyEdge";

export function DiagramPage() {
  const { id } = useParams<{ id: string }>();
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
      if (!diagram) throw new Error("Diagramma non caricato");
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

  useEffect(() => {
    if (!graphQuery.data) return;
    const built = buildGraph(
      graphQuery.data.topology,
      graphQuery.data.nodes,
      graphQuery.data.edges,
    );
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [graphQuery.data, setNodes, setEdges]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Operazione non riuscita",
      );
    }
  };

  const save = () =>
    run(async () => {
      const graph = graphQuery.data;
      if (!graph) return;

      const payloadNodes: DiagramNode[] = nodes.map((node) => {
        const data = node.data;
        if (!data) throw new Error("Nodo senza dati");
        return {
          nodeType: data.nodeType,
          entityId: data.entityId,
          x: node.position.x,
          y: node.position.y,
          width: node.measured?.width ?? null,
          height: node.measured?.height ?? null,
          collapsed: false,
        };
      });

      const payloadEdges: DiagramEdge[] = edges.map((edge) => {
        const data = edge.data;
        if (!data) throw new Error("Collegamento senza dati");
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
      setMessage("Layout salvato.");
    });

  const saveAs = () =>
    run(async () => {
      const graph = graphQuery.data;
      if (!graph) return;
      const name = window.prompt(
        "Nome del nuovo diagramma",
        `${graph.diagram.name} copia`,
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
      if (!window.confirm(`Eliminare il diagramma "${graph.diagram.name}"?`))
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
        `${preview.environments} ambienti`,
        `${preview.servers.length} server${preview.servers.length ? `: ${preview.servers.join(", ")}` : ""}`,
        `${preview.applications.length} applicazioni${preview.applications.length ? `: ${preview.applications.join(", ")}` : ""}`,
        `${preview.proxyConnections} connessioni proxy`,
        `${preview.proxyRoutes} route`,
      ].join("\n");

      if (
        !window.confirm(
          `Eliminare il nodo ${selected.nodeType} #${selected.entityId}?\n${detail}`,
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
          name: "Vista globale",
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
        <PageHeader title="Vista globale" />
        <p className="text-sm text-slate-600">
          Nessun diagramma predefinito. Creane uno per usare la vista globale.
        </p>
        {isSystemAdmin && (
          <button
            type="button"
            onClick={() => void createDefault()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Crea vista globale
          </button>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}
      </section>
    );
  }

  if (diagramQuery.isError) {
    return (
      <section className="space-y-4">
        <PageHeader title="Diagramma" />
        <p className="text-sm text-red-700">
          Diagramma non trovato. Torna all'elenco.
        </p>
        <Link to="/diagrams" className="text-sm underline">
          Diagrammi
        </Link>
      </section>
    );
  }

  const diagram = graphQuery.data?.diagram;

  return (
    <section ref={sectionRef} className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        title={diagram?.name ?? "Diagramma"}
        description={
          diagram?.isDefault ? "Vista globale predefinita" : undefined
        }
      >
        <div className="flex flex-wrap gap-2">
          <Link
            to="/diagrams"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            Elenco
          </Link>
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Salva
          </button>
          <button
            type="button"
            onClick={() => void saveAs()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            Salva come…
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {isFullscreen ? "Esci" : "Schermo intero"}
          </button>
          <button
            type="button"
            onClick={() => void removeDiagram()}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700"
          >
            Elimina
          </button>
        </div>
      </PageHeader>

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
          <p className="p-4 text-sm text-slate-500">Caricamento diagramma…</p>
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
              Chiudi
            </button>
          </div>
          {canDeleteNode(selected) && (
            <button
              type="button"
              onClick={() => void removeNode()}
              className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700"
            >
              Elimina nodo e dipendenze
            </button>
          )}
        </aside>
      )}
    </section>
  );
}
