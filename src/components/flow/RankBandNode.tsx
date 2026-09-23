import type { NodeProps, Node } from '@xyflow/react';
import type { BandNodeData } from '../../domain/graph/buildGraph.ts';

type BandNode = Node<BandNodeData, 'band'>;

/**
 * A full-width horizontal band behind each rank.
 *
 * Without these the columns are visually unconnected and the eye has nothing to follow
 * sideways - which is the actual reading task here ("how do these four differ on
 * Locations?").
 *
 * The band used to carry a fill on alternate rows. Now that facet nodes have surfaces
 * of their own, that fill read as stripes behind cards - two competing backgrounds and
 * no figure. So the band is reduced to a single hairline along its top edge: the row is
 * still drawn across the whole board, but only the nodes are objects.
 *
 * It also carries the cross-column focus highlight, which is why it keeps a rank key.
 * Purely decorative otherwise: aria-hidden, not focusable, under the policy nodes.
 */
export function RankBandNode({ data }: NodeProps<BandNode>) {
  return (
    <div
      className="rank-band"
      data-rank-key={data.nodeKey}
      style={{ width: data.width }}
      aria-hidden="true"
    />
  );
}
