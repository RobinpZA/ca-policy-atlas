import { BaseEdge, getStraightPath, type EdgeProps, type Edge } from '@xyflow/react';

type ChainEdgeType = Edge<{ ghost: boolean }, 'chain'>;

/**
 * Every edge means the same thing: "and also". Conditions are ANDed, so the edge needs
 * no label, no colour and no animation - it is pure connective tissue.
 *
 * Straight, not smoothstep. Every node in a column sits at the same x and the nodes are
 * stacked, so the edge is always a vertical drop; smoothstep was drawing rounded corners
 * on a line that has no corners, and paying for a path solver to do it. Drawn straight
 * and given real weight, the chain finally reads AS a chain - which is the one thing a
 * flow library was brought in to show and the one thing the old board did not show.
 *
 * An edge touching a ghost is dashed and faint: the chain stays unbroken, but it must
 * not imply the policy asserts something it does not.
 */
export function ChainEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
}: EdgeProps<ChainEdgeType>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  return (
    <BaseEdge
      id={id}
      path={path}
      {...(markerEnd ? { markerEnd } : {})}
      data-ghost={data?.ghost}
    />
  );
}
