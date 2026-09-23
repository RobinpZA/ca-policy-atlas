/**
 * Selection-level verdict.
 *
 * The board answers "how do these policies differ?" only once you have read it. This
 * answers it before you read anything: how many dimensions are in play, how many the
 * selection agrees on, and which ones are worth walking over to.
 *
 * Pure over SelectionDiff, so it is testable without React and carries no opinion the
 * diff does not already hold - it counts and it ranks, it never re-decides.
 */

import { NODE_SPEC_BY_KEY } from '../facetSpecs.ts';
import type { NodeKey } from '../types.ts';
import { SEVERITY, type DiffStatus } from './compare.ts';
import type { SelectionDiff } from './diffSelection.ts';

export interface HotDimension {
  readonly key: NodeKey;
  readonly title: string;
  /** The worst status any column holds for this rank - what makes it worth looking at. */
  readonly status: DiffStatus;
}

export interface SelectionSummary {
  readonly mode: 'single' | 'compare';
  /** Ranks that carry an assertion from at least one column, excluding head and terminal. */
  readonly dimensions: number;
  /** Of those, how many every column states identically. */
  readonly agree: number;
  /** Dimensions worth walking over to, most severe first, then in taxonomy order. */
  readonly hot: readonly HotDimension[];
}

/** Head and terminal are structure, not dimensions - counting them would inflate every total. */
const STRUCTURAL: ReadonlySet<NodeKey> = new Set<NodeKey>(['policy.head', 'end.terminal']);

export function summarize(diff: SelectionDiff): SelectionSummary {
  const ranks = diff.rankPlan.filter((key) => !STRUCTURAL.has(key));

  if (diff.mode === 'single') {
    return { mode: 'single', dimensions: ranks.length, agree: 0, hot: [] };
  }

  const hot: HotDimension[] = [];
  let agree = 0;

  for (const key of ranks) {
    let worst: DiffStatus = 'same';
    for (const column of diff.nodeStatus) {
      const status = column.get(key);
      if (status && SEVERITY[status] > SEVERITY[worst]) worst = status;
    }

    if (worst === 'same') {
      agree++;
      continue;
    }
    hot.push({ key, title: NODE_SPEC_BY_KEY.get(key)?.title ?? key, status: worst });
  }

  // Most severe first so the strip leads with the finding, not with the taxonomy. Ties
  // keep taxonomy order, which is the same order the board reads top to bottom - so the
  // chips and the columns never disagree about what comes first.
  const order = ranks.indexOf.bind(ranks);
  hot.sort(
    (a, b) => SEVERITY[b.status] - SEVERITY[a.status] || order(a.key) - order(b.key),
  );

  return { mode: 'compare', dimensions: ranks.length, agree, hot };
}
