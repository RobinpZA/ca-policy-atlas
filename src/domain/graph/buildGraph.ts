/**
 * FacetMap + diff -> React Flow nodes and edges.
 *
 * Layout is computed by hand rather than by dagre/elk, and that is a deliberate
 * choice: cross-column rank alignment IS the product. A layout engine optimises each
 * graph independently, so the same facet would land at a different y in every column
 * and the comparison would stop working. Forcing alignment out of a layout engine
 * needs rank constraints and phantom nodes - strictly more work than the ~80 lines here.
 */

import { FACETS_BY_NODE, NODE_SPEC_BY_KEY } from '../facetSpecs.ts';
import type { SelectionDiff } from '../diff/diffSelection.ts';
import type { DiffStatus, DiffReason, ValueDiff } from '../diff/compare.ts';
import { terminalOf, type Terminal } from './terminal.ts';
import type {
  DisplayToken,
  Expectation,
  NodeKey,
  NormalizedPolicy,
  Polarity,
} from '../types.ts';

// -- geometry ----------------------------------------------------------------
// Kept in sync with tokens.css (--node-w). Layout must be deterministic, so these
// are constants rather than measured DOM values.
export const NODE_W = 268;
export const COL_GAP = 40;
const PAD_Y = 14;
const ROW_LABEL_H = 18;
const TOKEN_H = 24;
const TOKEN_GAP = 6;
const ROW_GAP = 10;
const USABLE_W = NODE_W - 28;
const RANK_GAP = 34;
const HEAD_H = 96;
const TERMINAL_MIN_H = 74;

/** Rough rendered width of a value chip. Deliberately an over-estimate - a node that
 *  is slightly too tall costs nothing, one that is too short clips its own content. */
const tokenW = (label: string): number => Math.min(USABLE_W, label.length * 7.2 + 22);

/** How many lines a row's chips wrap into at NODE_W. */
function tokenLines(labels: readonly string[]): number {
  if (labels.length === 0) return 1;
  let lines = 1;
  let used = 0;
  for (const l of labels) {
    const w = tokenW(l) + TOKEN_GAP;
    if (used + w > USABLE_W && used > 0) {
      lines++;
      used = w;
    } else {
      used += w;
    }
  }
  return lines;
}

export interface NodeRow {
  readonly path: string;
  readonly label: string;
  readonly polarity: Polarity;
  readonly exp: Expectation;
  readonly display: readonly DisplayToken[];
  readonly status: DiffStatus;
  readonly reason?: DiffReason;
  readonly valueDiff?: ValueDiff;
  readonly notes?: readonly string[];
}

export type PolicyNodeKind = 'head' | 'facets' | 'terminal' | 'ghost';

export interface PolicyNodeData extends Record<string, unknown> {
  readonly nodeKey: NodeKey;
  readonly title: string;
  readonly kind: PolicyNodeKind;
  readonly status: DiffStatus;
  readonly rows: readonly NodeRow[];
  readonly policy: NormalizedPolicy;
  readonly terminal?: Terminal;
  readonly columnIndex: number;
}

/** Rows a policy contributes to one node, in taxonomy order. */
export function rowsFor(
  policy: NormalizedPolicy,
  nodeKey: NodeKey,
  diff: SelectionDiff,
  columnIndex: number,
): NodeRow[] {
  const paths = FACETS_BY_NODE.get(nodeKey) ?? [];
  const rows: NodeRow[] = [];

  for (const path of paths) {
    const facet = policy.facets.get(path);
    if (!facet) continue;
    const d = diff.byPath.get(path);
    const status = d?.status[columnIndex] ?? 'single';

    rows.push({
      path,
      label: facet.label,
      polarity: facet.polarity,
      exp: facet.exp,
      display: facet.display,
      status,
      ...(d?.reason ? { reason: d.reason } : {}),
      ...(d?.valueDiff?.[columnIndex] ? { valueDiff: d.valueDiff[columnIndex] } : {}),
      ...(d?.notes ? { notes: d.notes } : {}),
    });
  }
  return rows;
}

/** Height a node needs for its content. */
export function nodeHeight(kind: PolicyNodeKind, rows: readonly NodeRow[], terminal?: Terminal): number {
  if (kind === 'head') return HEAD_H;
  if (kind === 'ghost') return 52;
  if (kind === 'terminal') {
    return terminal?.sub ? TERMINAL_MIN_H + 16 : TERMINAL_MIN_H;
  }

  let h = PAD_Y * 2;
  rows.forEach((row, i) => {
    if (i > 0) h += ROW_GAP;
    h += ROW_LABEL_H;
    // Marker expectations render one inline glyph rather than a chip list.
    const labels = row.display.length ? row.display.map((d) => d.label) : ['⟨any⟩'];
    h += tokenLines(labels) * TOKEN_H + (tokenLines(labels) - 1) * TOKEN_GAP;
  });
  return Math.max(h, 56);
}

export interface RankLayout {
  /** y offset and height for each rank, shared by EVERY column. */
  readonly rows: ReadonlyMap<NodeKey, { y: number; h: number }>;
  readonly totalHeight: number;
}

/**
 * One shared vertical layout for the whole board.
 *
 * Each rank takes the height of its tallest column, so a rank occupies the same band
 * in every column. This is the mechanism that makes horizontal scanning - "how do
 * these four baselines differ on Locations?" - actually work.
 */
export function computeRankLayout(
  policies: readonly NormalizedPolicy[],
  diff: SelectionDiff,
): RankLayout {
  const rows = new Map<NodeKey, { y: number; h: number }>();
  let y = 0;

  for (const nodeKey of diff.rankPlan) {
    let h = 0;
    policies.forEach((policy, col) => {
      const kind = kindOf(nodeKey, policy, diff, col);
      const r = kind === 'facets' ? rowsFor(policy, nodeKey, diff, col) : [];
      const t = nodeKey === 'end.terminal' ? terminalOf(policy.facets) : undefined;
      h = Math.max(h, nodeHeight(kind, r, t));
    });
    rows.set(nodeKey, { y, h });
    y += h + RANK_GAP;
  }

  return { rows, totalHeight: Math.max(0, y - RANK_GAP) };
}

function kindOf(
  nodeKey: NodeKey,
  policy: NormalizedPolicy,
  diff: SelectionDiff,
  columnIndex: number,
): PolicyNodeKind {
  if (nodeKey === 'policy.head') return 'head';
  if (nodeKey === 'end.terminal') return 'terminal';
  return rowsFor(policy, nodeKey, diff, columnIndex).length > 0 ? 'facets' : 'ghost';
}

export interface BuiltGraph {
  readonly nodes: {
    id: string;
    type: 'policy';
    position: { x: number; y: number };
    data: PolicyNodeData;
    draggable: false;
    selectable: false;
  }[];
  readonly edges: {
    id: string;
    source: string;
    target: string;
    type: 'chain';
    data: { ghost: boolean };
  }[];
}

/**
 * Build one column's graph.
 *
 * Node ids encode the DIMENSION, not the value - `VanSurksum~CAD016::cond.locations`.
 * That is what lets the same facet occupy the same id shape in every column, so a
 * ghost slots into the identical rank when a column lacks it.
 */
export function buildGraph(
  policy: NormalizedPolicy,
  diff: SelectionDiff,
  columnIndex: number,
  layout: RankLayout,
): BuiltGraph {
  const nodes: BuiltGraph['nodes'] = [];
  const edges: BuiltGraph['edges'] = [];

  const plan = diff.rankPlan.length
    ? diff.rankPlan
    : (['policy.head', 'end.terminal'] as NodeKey[]);

  let previousId: string | undefined;
  let previousGhost = false;

  for (const nodeKey of plan) {
    const spec = NODE_SPEC_BY_KEY.get(nodeKey);
    const place = layout.rows.get(nodeKey);
    if (!spec || !place) continue;

    const kind = kindOf(nodeKey, policy, diff, columnIndex);
    const rows = kind === 'facets' ? rowsFor(policy, nodeKey, diff, columnIndex) : [];
    const terminal = nodeKey === 'end.terminal' ? terminalOf(policy.facets) : undefined;

    const status: DiffStatus =
      diff.mode === 'single'
        ? 'single'
        : (diff.nodeStatus[columnIndex]?.get(nodeKey) ?? 'missing');

    const id = `${policy.policyKey}::${nodeKey}`;

    nodes.push({
      id,
      type: 'policy',
      position: { x: 0, y: place.y },
      draggable: false,
      selectable: false,
      data: {
        nodeKey,
        title: spec.title,
        kind,
        status,
        rows,
        policy,
        columnIndex,
        ...(terminal ? { terminal } : {}),
      },
    });

    if (previousId) {
      edges.push({
        id: `${policy.policyKey}::${previousId}>${id}`,
        source: previousId,
        target: id,
        type: 'chain',
        // An edge touching a ghost is drawn faint and dashed: the chain must stay
        // unbroken, but it should not imply the policy asserts something it does not.
        data: { ghost: previousGhost || kind === 'ghost' },
      });
    }
    previousId = id;
    previousGhost = kind === 'ghost';
  }

  return { nodes, edges };
}
