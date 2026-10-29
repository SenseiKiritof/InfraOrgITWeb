import { Handle, Position } from "@xyflow/react";
import type { GraphNodeData } from "../../lib/buildGraph";
import type { TopologyProject } from "../../lib/diagrams";

const SIDES = [
  ["top", Position.Top],
  ["right", Position.Right],
  ["bottom", Position.Bottom],
  ["left", Position.Left],
] as const;

function Anchors({
  source = false,
  target = false,
}: {
  source?: boolean;
  target?: boolean;
}) {
  return (
    <>
      {SIDES.flatMap(([name, position]) => {
        const handles = [];
        if (source)
          handles.push(
            <Handle
              key={`s-${name}`}
              id={`s-${name}`}
              type="source"
              position={position}
              className="graph-handle"
            />,
          );
        if (target)
          handles.push(
            <Handle
              key={`t-${name}`}
              id={`t-${name}`}
              type="target"
              position={position}
              className="graph-handle"
            />,
          );
        return handles;
      })}
    </>
  );
}

function Projects({ projects }: { projects: TopologyProject[] }) {
  if (projects.length === 0) return null;
  const shown = projects.slice(0, 3);
  const extra = projects.length - shown.length;
  // Una sola riga: buildGraph riserva l'altezza di una riga di tag (HEADER, APP_H).
  return (
    <div className="flex gap-1 overflow-hidden px-2 py-1">
      {shown.map((project) => (
        <span
          key={project.id}
          className="graph-project min-w-0 truncate"
          title={project.name}
        >
          {project.name}
        </span>
      ))}
      {extra > 0 && <span className="graph-project shrink-0">+{extra}</span>}
    </div>
  );
}

function Container({
  data,
  variant,
}: {
  data: GraphNodeData;
  variant: "provider" | "environment" | "server";
}) {
  return (
    <div className={`graph-node graph-node-${variant}`}>
      <div className={`graph-header graph-header-${variant}`}>{data.label}</div>
      <Projects projects={data.projects} />
      {variant === "server" && <Anchors source target />}
    </div>
  );
}

export function ProviderNode({ data }: { data: GraphNodeData }) {
  return <Container data={data} variant="provider" />;
}

export function EnvironmentNode({ data }: { data: GraphNodeData }) {
  return <Container data={data} variant="environment" />;
}

export function ServerNode({ data }: { data: GraphNodeData }) {
  return <Container data={data} variant="server" />;
}

export function ApplicationNode({ data }: { data: GraphNodeData }) {
  return (
    <div className="graph-node graph-node-application">
      <Anchors target />
      <p className="shrink-0 truncate text-xs font-semibold" title={data.label}>
        {data.label}
      </p>
      {data.exposedPort != null && (
        <p className="text-[10px] text-slate-500">:{data.exposedPort}</p>
      )}
      <Projects projects={data.projects} />
    </div>
  );
}

export const nodeTypes = {
  ProviderNode,
  EnvironmentNode,
  ServerNode,
  ApplicationNode,
};
