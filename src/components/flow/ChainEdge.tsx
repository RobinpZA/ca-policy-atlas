import { BaseEdge, getSmoothStepPath, type EdgeProps, type Edge } from '@xyflow/react';

type ChainEdgeType = Edge<{ ghost: boolean }, 'chain'>;

/**
 * Every edge means the same thing: "and also". Conditions are ANDed, so the edge needs
 * no label, no colour and no animation - it is pure connective tissue.
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
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<ChainEdgeType>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 6,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      {...(markerEnd ? { markerEnd } : {})}
      data-ghost={data?.ghost}
    />
  );
}
