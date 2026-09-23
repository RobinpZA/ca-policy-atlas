import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
  type Viewport,
} from '@xyflow/react';

import { PolicyNode } from '../flow/PolicyNode.tsx';
import { RankBandNode } from '../flow/RankBandNode.tsx';
import { ChainEdge } from '../flow/ChainEdge.tsx';
import { buildBoard, computeRankLayout, COL_PITCH } from '../../domain/graph/buildGraph.ts';
import { collapseRankPlan, diffSelection } from '../../domain/diff/diffSelection.ts';
import { NODE_SPEC_BY_KEY } from '../../domain/facetSpecs.ts';
import { useAppState, useSelectedPolicies } from '../../state/appState.tsx';
import { activeRank, useFocus } from '../../state/focus.tsx';
import { MeasureContext } from '../../state/measure.tsx';
import type { NodeKey } from '../../domain/types.ts';

const nodeTypes: NodeTypes = { policy: PolicyNode, band: RankBandNode };
const edgeTypes: EdgeTypes = { chain: ChainEdge };

const PAD = 28;

function Board() {
  const selected = useSelectedPolicies();
  const { collapse } = useAppState();
  const focus = useFocus();
  const { setViewport } = useReactFlow();
  const shellRef = useRef<HTMLDivElement>(null);
  const [viewport, setLocalViewport] = useState<Viewport>({ x: PAD, y: PAD, zoom: 1 });

  // Rendered heights by node id. Reports arrive per node; they are batched into one state
  // update per animation frame, and a batch that changes nothing changes no state - so
  // a steady board settles after one correction instead of re-rendering per node.
  const [measured, setMeasured] = useState<ReadonlyMap<string, number>>(() => new Map());
  const pending = useRef(new Map<string, number>());
  const frame = useRef<number | null>(null);
  const reportHeight = useCallback((id: string, height: number) => {
    pending.current.set(id, Math.ceil(height));
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const batch = pending.current;
      pending.current = new Map();
      setMeasured((prev) => {
        const changed = [...batch].some(([k, v]) => prev.get(k) !== v);
        if (!changed) return prev;
        const next = new Map(prev);
        for (const [k, v] of batch) next.set(k, v);
        return next;
      });
    });
  }, []);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const full = useMemo(() => diffSelection(selected), [selected]);
  const diff = useMemo(() => collapseRankPlan(full, collapse), [full, collapse]);
  const hidden = full.rankPlan.length - diff.rankPlan.length;
  const layout = useMemo(
    () => computeRankLayout(selected, diff, measured),
    [selected, diff, measured],
  );
  const board = useMemo(() => buildBoard(selected, diff, layout), [selected, diff, layout]);

  // Once the user pans or zooms, a late height correction (a font finishing its load)
  // must not yank the view back to the fit. A new rank plan is a new board, and resets it.
  const userMoved = useRef(false);
  const fittedFor = useRef(diff);

  // One deterministic fit for the whole board. With a single canvas there is one
  // transform to set, so there is nothing to keep in step and nothing to drift.
  //
  // This deliberately zooms IN as well as out. An earlier version capped at 1.0, so a
  // two-column comparison sat at native size in the middle of a canvas three times its
  // width - technically correct, and a waste of the whole screen. The cap at 1.25 stops
  // a single narrow column from being blown up to something silly.
  useEffect(() => {
    const el = shellRef.current;
    if (!el || board.height === 0 || board.width === 0) return;
    if (fittedFor.current !== diff) {
      fittedFor.current = diff;
      userMoved.current = false;
    }
    if (userMoved.current) return;

    const availW = el.clientWidth - PAD * 2;
    const availH = el.clientHeight - PAD * 2;
    const zoom = Math.max(0.4, Math.min(1.25, availW / board.width, availH / board.height));

    // Centre on whichever axis has room to spare. A four-column comparison is usually
    // much shorter than the viewport, and pinning it to the top left it sitting above a
    // third of a screen of nothing.
    const scaledW = board.width * zoom;
    const scaledH = board.height * zoom;
    const next: Viewport = {
      x: scaledW < availW ? (el.clientWidth - scaledW) / 2 : PAD,
      y: scaledH < availH ? Math.max(PAD, (el.clientHeight - scaledH) / 2) : PAD,
      zoom,
    };
    setViewport(next, { duration: 0 });
    setLocalViewport(next);
  }, [board, diff, setViewport]);

  // Arrow keys: up/down walks ranks, left/right jumps to the same rank in the next
  // column. That second binding is the whole product as a keystroke.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const node = (e.target as HTMLElement).closest<HTMLElement>('.pnode');
    if (!node) return;

    const col = Number(node.dataset['col'] ?? '-1');
    const rank = Number(node.dataset['rank'] ?? '-1');
    if (col < 0 || rank < 0) return;

    let nextCol = col;
    let nextRank = rank;
    if (e.key === 'ArrowDown') nextRank = rank + 1;
    else if (e.key === 'ArrowUp') nextRank = rank - 1;
    else if (e.key === 'ArrowRight') nextCol = col + 1;
    else if (e.key === 'ArrowLeft') nextCol = col - 1;
    else if (e.key === 'Escape') {
      node.blur();
      return;
    } else return;

    const target = document.querySelector<HTMLElement>(
      `.pnode[data-col="${nextCol}"][data-rank="${nextRank}"]`,
    );
    if (target) {
      e.preventDefault();
      target.focus();
    }
  }, []);

  // The one rule CSS cannot express on its own: light the rank whose key matches the
  // board's. Validated against the taxonomy before it reaches a stylesheet, so nothing
  // but a known node key can ever be interpolated here.
  const lit = activeRank(focus);
  const litRule =
    lit && NODE_SPEC_BY_KEY.has(lit)
      ? `.board[data-focus-rank] .pnode[data-rank-key="${lit}"],
         .board[data-focus-rank] .rank-band[data-rank-key="${lit}"] { opacity: 1; }
         .board[data-focus-rank] .rank-band[data-rank-key="${lit}"] { background: var(--node-fill-raised); }
         .board[data-focus-rank] .pnode[data-rank-key="${lit}"][data-kind="ghost"] { opacity: var(--diff-ghost-opacity); }
         .board[data-focus-rank] .gutter-label[data-rank-key="${lit}"] { color: var(--color-ink); }`
      : '';

  return (
    <MeasureContext.Provider value={reportHeight}>
      <div
        className="board"
        onKeyDown={onKeyDown}
        // The whole cross-column highlight is CSS keyed off this one attribute. It is the
        // reason hovering a node does not rebuild a single React Flow node.
        {...(lit ? { 'data-focus-rank': lit } : {})}
      >
        {litRule ? <style>{litRule}</style> : null}

        <div className="gutter" aria-hidden="true">
          {diff.rankPlan.map((key) => {
            const place = layout.rows.get(key);
            const spec = NODE_SPEC_BY_KEY.get(key);
            if (!place || !spec) return null;
            return (
              <div
                key={key}
                className="gutter-label"
                data-rank-key={key}
                style={{ top: place.y * viewport.zoom + viewport.y }}
              >
                <span className="gutter-tick" />
                <span className="gutter-text">{spec.title}</span>
              </div>
            );
          })}
          {hidden > 0 ? (
            <div className="gutter-hidden">
              {hidden} identical row{hidden === 1 ? '' : 's'} hidden
            </div>
          ) : null}
        </div>

        <div className="board-canvas" ref={shellRef}>
          <ReactFlow
            nodes={board.nodes}
            edges={board.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onMove={(_, v) => setLocalViewport(v)}
            // A programmatic setViewport arrives with no event; only a person's does.
            onMoveStart={(event) => {
              if (event) userMoved.current = true;
            }}
            // The pointer half of the cross-column highlight has to live HERE rather than
            // on the node component. React Flow gives a node wrapper `pointer-events: none`
            // unless the node is selectable or draggable, or the flow carries these
            // handlers - and this board deliberately makes nodes neither. Wired on the
            // node itself, the hover silently never fires.
            onNodeMouseEnter={(_, node) => {
              const key = (node.data as { nodeKey?: NodeKey }).nodeKey;
              if (key) focus.setRank(key);
            }}
            onNodeMouseLeave={() => focus.setRank(null)}
            defaultViewport={{ x: PAD, y: PAD, zoom: 1 }}
            minZoom={0.4}
            maxZoom={1.3}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            nodesFocusable
            edgesFocusable={false}
            panOnScroll
            selectionOnDrag={false}
            proOptions={{ hideAttribution: true }}
            aria-label={`Comparing ${selected.length} Conditional Access policies`}
          >
            {/* The auto-fit above can land well under 1x for a large comparison, and
              panOnScroll claims the wheel for panning - so scroll-to-zoom isn't there
              as an escape hatch. This is the one discoverable way back to a size the
              user chose rather than the one that happened to fit. */}
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        </div>
      </div>
    </MeasureContext.Provider>
  );
}

export function CompareBoard() {
  const selected = useSelectedPolicies();

  if (selected.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing selected yet</h2>
        <p>
          Pick policies from the list on the left. One shows a single flow; two or more line them up
          side by side and mark every row where they disagree.
        </p>
        <p className="empty-sub">
          94 baseline policies from Van Surksum, Maester, CIS and CISA SCuBA. You can also load your
          own exported policies &mdash; they stay in this browser.
        </p>
      </div>
    );
  }

  return (
    <ReactFlowProvider key={selected.map((p) => p.policyKey).join('|')}>
      <Board />
    </ReactFlowProvider>
  );
}

export { COL_PITCH };
