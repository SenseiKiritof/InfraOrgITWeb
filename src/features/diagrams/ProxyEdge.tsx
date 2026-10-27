import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { useState } from "react";
import type { GraphEdgeData } from "../../lib/buildGraph";

export function ProxyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  selected,
  data,
}: EdgeProps<Edge<GraphEdgeData>>) {
  const [hovered, setHovered] = useState(false);
  const bend =
    data?.bendX != null && data?.bendY != null
      ? { x: data.bendX, y: data.bendY }
      : null;

  let edgePath: string;
  let labelX: number;
  let labelY: number;
  if (bend) {
    const mx = (sourceX + targetX) / 2;
    const my = (sourceY + targetY) / 2;
    edgePath = `M ${sourceX},${sourceY} Q ${mx + 2 * bend.x},${my + 2 * bend.y} ${targetX},${targetY}`;
    labelX = mx + bend.x;
    labelY = my + bend.y;
  } else {
    [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }

  // Le etichette si mostrano solo su hover/selezione: l'overview resta pulito.
  const showLabel = Boolean(label) && (selected || hovered);

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <path
        d={edgePath}
        fill="none"
        strokeWidth={12}
        stroke="transparent"
        style={{ pointerEvents: "stroke" }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan edge-label absolute rounded border px-1 py-0.5"
            title={typeof label === "string" ? label : undefined}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: selected ? 3002 : 3001,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { proxy: ProxyEdge };
