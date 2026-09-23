/**
 * Selection-level diff.
 *
 * Operates purely on FacetMaps - it never sees a React Flow node. That separation is
 * what lets the comparison semantics be tested exhaustively in isolation, and lets the
 * layout change without any risk to correctness.
 */

import { FACET_SPECS, NODE_SPECS } from '../facetSpecs.ts';
import type { NodeKey, NormalizedPolicy } from '../types.ts';
import {
  compareGroup,
  computeValueDiff,
  moreSevere,
  type DiffReason,
  type DiffStatus,
  type ValueDiff,
} from './compare.ts';

export interface FacetDiff {
  readonly path: string;
  /** One entry per selected column, in selection order. */
  readonly status: readonly DiffStatus[];
  readonly reason?: DiffReason;
  readonly notes?: readonly string[];
  readonly valueDiff?: readonly (ValueDiff | undefined)[];
}

export interface SelectionDiff {
  readonly mode: 'single' | 'compare';
  /** Facet paths that at least one column asserts, in taxonomy order. */
  readonly paths: readonly string[];
  readonly byPath: ReadonlyMap<string, FacetDiff>;
  /** nodeStatus[columnIndex].get(nodeKey) - facet statuses rolled up per node. */
  readonly nodeStatus: readonly ReadonlyMap<NodeKey, DiffStatus>[];
  /**
   * The node keys every column renders, in rank order. Columns that lack a node still
   * render it as a ghost so equivalent facets stay on the same horizontal line - which
   * is the only reason side-by-side comparison is readable at all.
   */
  readonly rankPlan: readonly NodeKey[];
}

const ALWAYS_PRESENT: readonly NodeKey[] = ['policy.head', 'end.terminal'];

/** Node keys a single policy needs, in rank order. */
export function ranksOf(policy: NormalizedPolicy): readonly NodeKey[] {
  const needed = new Set<NodeKey>(ALWAYS_PRESENT);
  for (const spec of FACET_SPECS) {
    if (policy.facets.has(spec.path)) needed.add(spec.node);
  }
  return NODE_SPECS.filter((n) => needed.has(n.key)).map((n) => n.key);
}

export function diffSelection(selected: readonly NormalizedPolicy[]): SelectionDiff {
  const n = selected.length;

  if (n === 0) {
    return { mode: 'single', paths: [], byPath: new Map(), nodeStatus: [], rankPlan: [] };
  }

  if (n === 1) {
    const only = selected[0]!;
    const paths = FACET_SPECS.filter((s) => only.facets.has(s.path)).map((s) => s.path);
    const byPath = new Map<string, FacetDiff>(
      paths.map((p) => [p, { path: p, status: ['single' as DiffStatus] }]),
    );
    const rankPlan = ranksOf(only);
    const nodeStatus = new Map<NodeKey, DiffStatus>(rankPlan.map((k) => [k, 'single']));
    return { mode: 'single', paths, byPath, nodeStatus: [nodeStatus], rankPlan };
  }

  const maps = selected.map((p) => p.facets);

  // Ordered union: taxonomy order, restricted to paths somebody asserts. Keeping this
  // in FACET_SPECS order is what makes the rank gutter and every column agree.
  const paths = FACET_SPECS.map((s) => s.path).filter((p) => maps.some((m) => m.has(p)));

  const byPath = new Map<string, FacetDiff>();

  for (const path of paths) {
    const present = maps.map((m) => m.get(path));
    const defined = present.filter((f): f is NonNullable<typeof f> => f !== undefined);
    const nPresent = defined.length;

    if (nPresent === 1) {
      byPath.set(path, {
        path,
        status: present.map((f) => (f ? 'only' : 'missing')),
      });
      continue;
    }

    const group = compareGroup(defined);

    const status: DiffStatus[] = present.map((f) => {
      if (!f) return 'missing';
      if (group.allEqual) {
        // Equal among those that have it, but not everyone has it. Calling this "same"
        // would be false at the selection level; giving it full emphasis would be noise.
        // It gets its own status and the lightest visual weight.
        return nPresent === n ? 'same' : 'differs/coverage';
      }
      return group.status ?? 'differs';
    });

    const valueDiff =
      !group.allEqual && group.reason === 'value' ? computeValueDiff(present) : undefined;

    byPath.set(path, {
      path,
      status,
      ...(group.reason ? { reason: group.reason } : {}),
      ...(group.notes ? { notes: group.notes } : {}),
      ...(valueDiff ? { valueDiff } : {}),
    });
  }

  // Roll facet statuses up to node statuses, per column: a node shows its worst facet.
  const nodeStatus: Map<NodeKey, DiffStatus>[] = selected.map(() => new Map());
  for (const path of paths) {
    const diff = byPath.get(path);
    const spec = FACET_SPECS.find((s) => s.path === path);
    if (!diff || !spec) continue;
    for (let i = 0; i < n; i++) {
      const s = diff.status[i];
      if (!s) continue;
      const map = nodeStatus[i]!;
      const prev = map.get(spec.node);
      map.set(spec.node, prev ? moreSevere(prev, s) : s);
    }
  }

  const needed = new Set<NodeKey>(ALWAYS_PRESENT);
  for (const path of paths) {
    const spec = FACET_SPECS.find((s) => s.path === path);
    if (spec) needed.add(spec.node);
  }
  const rankPlan = NODE_SPECS.filter((nd) => needed.has(nd.key)).map((nd) => nd.key);

  // A column with no facets at all for a planned node renders it as a ghost.
  for (const map of nodeStatus) {
    for (const key of rankPlan) {
      if (!map.has(key)) map.set(key, 'missing');
    }
  }

  return { mode: 'compare', paths, byPath, nodeStatus, rankPlan };
}

/** Stable memo key for a selection - order-sensitive, because column order is visible. */
export const selectionKey = (selected: readonly NormalizedPolicy[]): string =>
  selected.map((p) => p.policyKey).join('|');

/** Ranks that are structural rather than asserted, and so are never collapsed away. */
const NEVER_COLLAPSED: ReadonlySet<NodeKey> = new Set(ALWAYS_PRESENT);

/**
 * Drop every rank on which all columns agree.
 *
 * Six baselines with overlapping conditions produce a fourteen-rank board of which
 * perhaps three ranks carry a disagreement. Reading the other eleven is the cost of
 * finding those three. This collapses them, and returns a diff whose rankPlan is the
 * only thing that changed - layout, board build and the gutter all follow with no
 * further plumbing.
 *
 * The head and the terminal always survive: a column with no identity and no outcome
 * is not a policy, it is a fragment. Single-policy mode is returned untouched, since
 * "every column agrees" is vacuously true of one column.
 */
export function collapseRankPlan(diff: SelectionDiff, on: boolean): SelectionDiff {
  if (!on || diff.mode === 'single') return diff;

  const rankPlan = diff.rankPlan.filter((key) => {
    if (NEVER_COLLAPSED.has(key)) return true;
    return !diff.nodeStatus.every((column) => column.get(key) === 'same');
  });

  return rankPlan.length === diff.rankPlan.length ? diff : { ...diff, rankPlan };
}
