/**
 * The verdict strip and the differences-only collapse.
 *
 * Both answer the same question - "which of these ranks is worth looking at?" - and both
 * are read before the board is. If they disagree with the board, the user is told to look
 * somewhere the board has not marked, which is worse than not telling them at all. These
 * assertions pin them to the same source of truth.
 */

import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { collapseRankPlan, diffSelection } from '../src/domain/diff/diffSelection.ts';
import { summarize } from '../src/domain/diff/summarize.ts';
import { SEVERITY } from '../src/domain/diff/compare.ts';
import type { NormalizedPolicy } from '../src/domain/types.ts';

const pick = (...keys: string[]): NormalizedPolicy[] =>
  keys.map((k) => {
    const p = BASELINES.byKey.get(k);
    if (!p) throw new Error(`missing ${k}`);
    return p;
  });

/** The selection from the screenshot that prompted the redesign: four legacy-auth blocks. */
const LEGACY = pick(
  'CIS~CIS-5.2.2.3',
  'CISA~MS.AAD.1.1',
  'CIS~CIS-5.2.2.12',
  'CISA~MS.AAD.3.9',
);

const MIXED = pick('VanSurksum~CAD016', 'CIS~CIS-5.2.2.4', 'Maester~MT.1011');

describe('summarize', () => {
  it('counts only real dimensions - head and terminal are structure, not findings', () => {
    const diff = diffSelection(LEGACY);
    const summary = summarize(diff);

    expect(summary.mode).toBe('compare');
    expect(diff.rankPlan).toContain('policy.head');
    expect(diff.rankPlan).toContain('end.terminal');
    expect(summary.dimensions).toBe(diff.rankPlan.length - 2);
  });

  it('every dimension is either agreed or hot, never both and never neither', () => {
    for (const selection of [LEGACY, MIXED]) {
      const summary = summarize(diffSelection(selection));
      expect(summary.agree + summary.hot.length).toBe(summary.dimensions);
    }
  });

  it('ranks hot dimensions most severe first', () => {
    const summary = summarize(diffSelection(MIXED));
    expect(summary.hot.length).toBeGreaterThan(0);

    const severities = summary.hot.map((h) => SEVERITY[h.status]);
    expect(severities).toEqual([...severities].sort((a, b) => b - a));
  });

  it('gives every hot dimension a human title rather than a dotted key', () => {
    for (const dim of summarize(diffSelection(MIXED)).hot) {
      expect(dim.title).not.toBe(dim.key);
      expect(dim.title.length).toBeGreaterThan(0);
    }
  });

  it('reports nothing hot for a single policy - there is nothing to compare against', () => {
    const summary = summarize(diffSelection(pick('VanSurksum~CAD016')));
    expect(summary.mode).toBe('single');
    expect(summary.hot).toEqual([]);
  });
});

describe('collapseRankPlan', () => {
  it('keeps exactly the head, the terminal, and the hot dimensions', () => {
    const diff = diffSelection(MIXED);
    const summary = summarize(diff);
    const collapsed = collapseRankPlan(diff, true);

    expect(collapsed.rankPlan).toContain('policy.head');
    expect(collapsed.rankPlan).toContain('end.terminal');
    expect(collapsed.rankPlan).toHaveLength(summary.hot.length + 2);

    // The collapse and the verdict strip must agree on what is worth showing.
    const hidden = diff.rankPlan.filter((k) => !collapsed.rankPlan.includes(k));
    for (const key of hidden) {
      expect(summary.hot.map((h) => h.key)).not.toContain(key);
    }
  });

  it('preserves rank order, so the board does not reshuffle when it collapses', () => {
    const diff = diffSelection(MIXED);
    const collapsed = collapseRankPlan(diff, true);
    const order = diff.rankPlan.filter((k) => collapsed.rankPlan.includes(k));
    expect(collapsed.rankPlan).toEqual(order);
  });

  it('is a no-op when off, and returns the same object so memoisation still holds', () => {
    const diff = diffSelection(MIXED);
    expect(collapseRankPlan(diff, false)).toBe(diff);
  });

  it('never collapses a single policy to nothing', () => {
    const diff = diffSelection(pick('Maester~MT.1011'));
    const collapsed = collapseRankPlan(diff, true);
    expect(collapsed.rankPlan).toEqual(diff.rankPlan);
  });

  it('leaves a head and a terminal even when every dimension agrees', () => {
    // A policy compared against itself agrees on everything by construction.
    const self = pick('CIS~CIS-5.2.2.3');
    const diff = diffSelection([self[0]!, self[0]!]);
    const collapsed = collapseRankPlan(diff, true);
    expect(collapsed.rankPlan).toEqual(['policy.head', 'end.terminal']);
  });
});
