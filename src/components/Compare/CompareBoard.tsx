import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Viewport,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';

import { PolicyNode } from '../flow/PolicyNode.tsx';
import { ChainEdge } from '../flow/ChainEdge.tsx';
import { buildGraph, computeRankLayout, NODE_W } from '../../domain/graph/buildGraph.ts';
import { diffSelection } from '../../domain/diff/diffSelection.ts';
import { NODE_SPEC_BY_KEY } from '../../domain/facetSpecs.ts';
import { computeFit, viewportStore } from '../../state/linkedViewport.ts';
import { useAppState, useSelectedPolicies } from '../../state/appState.tsx';
import type { NormalizedPolicy } from '../../domain/types.ts';

const nodeTypes: NodeTypes = { policy: PolicyNode };
const edgeTypes: EdgeTypes = { chain: ChainEdge };

interface ColumnProps {
  policy: NormalizedPolicy;
  columnIndex: number;
  diff: ReturnType<typeof diffSelection>;
  layout: ReturnType<typeof computeRankLayout>;
}

function ColumnFlow({ policy, columnIndex, diff, layout }: ColumnProps) {
  const { setViewport } = useReactFlow();
  const { linked } = useAppState();
  const id = policy.policyKey;

  const { nodes, edges } = useMemo(
    () => buildGraph(policy, diff, columnIndex, layout),
    [policy, diff, columnIndex, layout],
  );

  // Mirror the shared viewport - unless this column is the one driving the gesture.
  // Without that guard, applying a viewport re-fires onMove and the columns oscillate.
  useEffect(() => {
    if (!linked) return undefined;
    return viewportStore.subscribe((v, source) => {
      if (source === id) return;
      setViewport(v, { duration: 0 });
    });
  }, [id, linked, setViewport]);

  const onMoveStart = useCallback(() => viewportStore.claim(id), [id]);
  const onMoveEnd = useCallback(() => viewportStore.release(id), [id]);
  const onMove = useCallback(
    (_: unknown, v: Viewport) => {
      if (linked && viewportStore.isDriver(id)) viewportStore.publish(v, id);
    },
    [id, linked],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onMoveStart={onMoveStart}
      onMove={onMove}
      onMoveEnd={onMoveEnd}
      defaultViewport={viewportStore.get()}
      minZoom={0.35}
      maxZoom={1.4}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      nodesFocusable
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
      aria-label={`Policy flow for ${policy.name}`}
    />
  );
}

function RankGutter({
  layout,
  rankPlan,
  viewport,
}: {
  layout: ReturnType<typeof computeRankLayout>;
  rankPlan: readonly string[];
  viewport: Viewport;
}) {
  return (
    <div className="gutter" aria-hidden="true">
      {rankPlan.map((key) => {
        const place = layout.rows.get(key as never);
        const spec = NODE_SPEC_BY_KEY.get(key as never);
        if (!place || !spec) return null;
        return (
          <div
            key={key}
            className="gutter-label"
            style={{ top: `${place.y * viewport.zoom + viewport.y}px` }}
          >
            {spec.title}
          </div>
        );
      })}
    </div>
  );
}

export function CompareBoard() {
  const selected = useSelectedPolicies();
  const { linked } = useAppState();
  const boardRef = useRef<HTMLDivElement>(null);
  const [viewport, setLocalViewport] = useState<Viewport>(viewportStore.get());

  const diff = useMemo(() => diffSelection(selected), [selected]);
  const layout = useMemo(() => computeRankLayout(selected, diff), [selected, diff]);

  // The gutter tracks the shared viewport so its rank labels stay glued to the rows.
  useEffect(() => viewportStore.subscribe((v) => setLocalViewport(v)), []);

  // One deterministic fit per layout change, broadcast to every column. Letting each
  // column call fitView would land them at different zooms and break alignment.
  useEffect(() => {
    const h = boardRef.current?.clientHeight ?? 600;
    const v = computeFit(layout.totalHeight, h);
    viewportStore.publish(v, null);
    setLocalViewport(v);
  }, [layout]);

  // Arrow keys: up/down walks ranks in this column, left/right jumps to the same rank
  // in the next column. That second binding is the whole product as a keystroke.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const node = target.closest<HTMLElement>('.pnode');
    if (!node) return;

    const wrapper = node.closest<HTMLElement>('[data-col]');
    const col = Number(wrapper?.dataset['col'] ?? '-1');
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-col] .pnode'));
    const inCol = (c: number) =>
      all.filter((n) => Number(n.closest<HTMLElement>('[data-col]')?.dataset['col']) === c);

    const siblings = inCol(col);
    const idx = siblings.indexOf(node);
    let next: HTMLElement | undefined;

    if (e.key === 'ArrowDown') next = siblings[idx + 1];
    else if (e.key === 'ArrowUp') next = siblings[idx - 1];
    else if (e.key === 'ArrowRight') next = inCol(col + 1)[idx];
    else if (e.key === 'ArrowLeft') next = inCol(col - 1)[idx];
    else if (e.key === 'Escape') {
      node.blur();
      return;
    } else return;

    if (next) {
      e.preventDefault();
      next.focus();
    }
  }, []);

  if (selected.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing selected yet</h2>
        <p>
          Pick policies from the list on the left. One shows a single flow; two or more line
          them up side by side and mark every row where they disagree.
        </p>
        <p>
          94 baseline policies are loaded from Van Surksum, Maester, CIS and CISA SCuBA. You
          can also load your own exported policies &mdash; they stay in this browser.
        </p>
      </div>
    );
  }

  return (
    <div className="board" ref={boardRef} onKeyDown={onKeyDown}>
      <RankGutter layout={layout} rankPlan={diff.rankPlan} viewport={viewport} />
      <div className="columns">
        {selected.map((policy, i) => (
          <div
            className="column"
            key={policy.policyKey}
            data-col={i}
            style={{ width: NODE_W + 40 }}
          >
            <div className="column-head">
              <div className="column-source">
                <span>{policy.source === 'tenant' ? 'loaded' : policy.baselineKey}</span>
                <span>{policy.id}</span>
              </div>
              <div className="column-name" title={policy.fullName ?? policy.name}>
                {policy.name}
              </div>
            </div>
            <div className="column-flow">
              <ReactFlowProvider>
                <ColumnFlow
                  policy={policy}
                  columnIndex={i}
                  diff={diff}
                  layout={layout}
                  key={linked ? 'linked' : 'free'}
                />
              </ReactFlowProvider>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
