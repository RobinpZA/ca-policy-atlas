/**
 * Layout invariants.
 *
 * Rank alignment across columns is the entire premise of the side-by-side view - if it
 * breaks, the tool silently stops being a comparison and becomes six unrelated diagrams.
 * These assertions are the guard on that, and they are the reason the layout is computed
 * by hand rather than handed to a layout engine.
 */

import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { diffSelection } from '../src/domain/diff/diffSelection.ts';
import {
  buildBoard,
  buildGraph,
  computeRankLayout,
  nodeHeight,
  nodeId,
  COL_PITCH,
} from '../src/domain/graph/buildGraph.ts';
import { terminalOf } from '../src/domain/graph/terminal.ts';
import type { NormalizedPolicy } from '../src/domain/types.ts';

const pick = (...keys: string[]): NormalizedPolicy[] =>
  keys.map((k) => {
    const p = BASELINES.byKey.get(k);
    if (!p) throw new Error(`missing ${k}`);
    return p;
  });

const SELECTION = pick(
  'VanSurksum~CAD016',
  'CIS~CIS-5.2.2.4',
  'Maester~MT.1011',
  'CISA~MS.AAD.2.1',
);

describe('rank alignment', () => {
  const diff = diffSelection(SELECTION);
  const layout = computeRankLayout(SELECTION, diff);
  const graphs = SELECTION.map((p, i) => buildGraph(p, diff, i, layout));

  it('gives every column the same number of nodes', () => {
    const counts = new Set(graphs.map((g) => g.nodes.length));
    expect(counts.size).toBe(1);
    expect(graphs[0]!.nodes.length).toBe(diff.rankPlan.length);
  });

  it('puts the same rank at the same y in every column - the whole point', () => {
    for (const nodeKey of diff.rankPlan) {
      const ys = graphs.map(
        (g) => g.nodes.find((n) => n.data.nodeKey === nodeKey)?.position.y,
      );
      expect(new Set(ys).size).toBe(1);
      expect(ys[0]).toBeTypeOf('number');
    }
  });

  it('emits nodes in taxonomy rank order, never selection order', () => {
    for (const g of graphs) {
      const keys = g.nodes.map((n) => n.data.nodeKey);
      expect(keys).toEqual([...diff.rankPlan]);
    }
  });

  it('keeps the chain unbroken, ghosts included', () => {
    for (const g of graphs) {
      expect(g.edges.length).toBe(g.nodes.length - 1);
      g.edges.forEach((e, i) => {
        expect(e.source).toBe(g.nodes[i]!.id);
        expect(e.target).toBe(g.nodes[i + 1]!.id);
      });
    }
  });

  it('marks edges touching a ghost so they read as absent, not asserted', () => {
    const withGhost = graphs.flatMap((g) =>
      g.nodes.filter((n) => n.data.kind === 'ghost').map((n) => n.id),
    );
    expect(withGhost.length).toBeGreaterThan(0);

    for (const g of graphs) {
      for (const e of g.edges) {
        const touchesGhost = withGhost.includes(e.source) || withGhost.includes(e.target);
        if (touchesGhost) expect(e.data.ghost).toBe(true);
      }
    }
  });

  it('sizes each rank to its tallest column so nothing clips', () => {
    for (const nodeKey of diff.rankPlan) {
      const place = layout.rows.get(nodeKey);
      expect(place).toBeDefined();
      expect(place!.h).toBeGreaterThan(0);
    }
    expect(layout.totalHeight).toBeGreaterThan(0);
  });

  it('gives every node an id encoding the dimension, not the value', () => {
    for (const [i, g] of graphs.entries()) {
      for (const n of g.nodes) {
        expect(n.id).toBe(`${SELECTION[i]!.policyKey}::${n.data.nodeKey}`);
      }
    }
  });
});

describe('single-policy mode', () => {
  it('omits ranks the policy says nothing about, rather than ghosting them', () => {
    const [only] = pick('Maester~MT.1003');
    const diff = diffSelection([only!]);
    const layout = computeRankLayout([only!], diff);
    const { nodes } = buildGraph(only!, diff, 0, layout);

    expect(nodes.some((n) => n.data.kind === 'ghost')).toBe(false);
    expect(nodes.some((n) => n.data.nodeKey === 'cond.locations')).toBe(false);
    expect(nodes[0]?.data.kind).toBe('head');
    expect(nodes[nodes.length - 1]?.data.kind).toBe('terminal');
  });
});

describe('every policy in the corpus builds a coherent graph', () => {
  it('always starts at a head and ends at a terminal, with no orphan nodes', () => {
    for (const policy of BASELINES.policies) {
      const diff = diffSelection([policy]);
      const layout = computeRankLayout([policy], diff);
      const { nodes, edges } = buildGraph(policy, diff, 0, layout);

      expect(nodes.length).toBeGreaterThanOrEqual(2);
      expect(nodes[0]!.data.kind).toBe('head');
      expect(nodes[nodes.length - 1]!.data.kind).toBe('terminal');
      expect(edges.length).toBe(nodes.length - 1);

      // Heights must be positive or the node renders collapsed.
      for (const n of nodes) {
        const place = layout.rows.get(n.data.nodeKey);
        expect(place!.h).toBeGreaterThan(0);
      }
    }
  });

  it('gives every policy a terminal tone, including the four that assert no control', () => {
    const tones = new Map<string, number>();
    for (const policy of BASELINES.policies) {
      const t = terminalOf(policy.facets);
      tones.set(t.tone, (tones.get(t.tone) ?? 0) + 1);
      expect(t.title.length).toBeGreaterThan(0);
    }
    // All four tones occur in the shipped corpus.
    expect(tones.get('block')).toBeGreaterThan(0);
    expect(tones.get('grant')).toBeGreaterThan(0);
    expect(tones.get('session')).toBeGreaterThan(0);
    expect(tones.get('none')).toBe(4); // MT.1003, MT.1004, MT.1011, MT.1071
  });
});

describe('the whole board', () => {
  it('draws one band per rank and keeps columns on a single x pitch', () => {
    const diff = diffSelection(SELECTION);
    const layout = computeRankLayout(SELECTION, diff);
    const board = buildBoard(SELECTION, diff, layout);

    const bands = board.nodes.filter((n) => n.type === 'band');
    expect(bands).toHaveLength(diff.rankPlan.length);
    // Each band carries its rank key, in rank order. The cross-column focus highlight
    // is keyed off exactly this, so a band without its key would silently break it.
    expect(bands.map((b) => (b.data as { nodeKey: string }).nodeKey)).toEqual([
      ...diff.rankPlan,
    ]);

    const policyNodes = board.nodes.filter((n) => n.type === 'policy');
    const xs = [...new Set(policyNodes.map((n) => n.position.x))].sort((a, b) => a - b);
    expect(xs).toEqual(SELECTION.map((_, i) => i * COL_PITCH));
  });

  it('still aligns ranks across columns once composed into one canvas', () => {
    const diff = diffSelection(SELECTION);
    const layout = computeRankLayout(SELECTION, diff);
    const board = buildBoard(SELECTION, diff, layout);

    for (const nodeKey of diff.rankPlan) {
      const ys = board.nodes
        .filter((n) => n.type === 'policy' && (n.data as { nodeKey: string }).nodeKey === nodeKey)
        .map((n) => n.position.y);
      expect(ys).toHaveLength(SELECTION.length);
      expect(new Set(ys).size).toBe(1);
    }
  });

  it('sizes a head node to fit a title that wraps past two lines', () => {
    // CIS-5.2.2.3's name wraps to three lines at NODE_W; a fixed height clipped it.
    const long = BASELINES.byKey.get('CIS~CIS-5.2.2.3')!;
    const short = BASELINES.byKey.get('CISA~MS.AAD.1.1')!;
    const tall = nodeHeight('head', [], undefined, long);
    const squat = nodeHeight('head', [], undefined, short);
    expect(long.name.length).toBeGreaterThan(short.name.length);
    expect(tall).toBeGreaterThan(squat);
  });
});

describe('measured heights', () => {
  const diff = diffSelection(SELECTION);
  const estimated = computeRankLayout(SELECTION, diff);

  it('lets a rendered height replace the estimate, and keeps every column aligned', () => {
    // One column's Users node rendered 200px taller than predicted - a late web font, a
    // wrap the metric table missed. The whole band grows, in every column at once.
    const rank = diff.rankPlan.find((k) => k !== 'policy.head' && k !== 'end.terminal')!;
    const tall = estimated.rows.get(rank)!.h + 200;
    const measured = new Map([[nodeId(SELECTION[1]!, rank), tall]]);
    const layout = computeRankLayout(SELECTION, diff, measured);

    expect(layout.rows.get(rank)!.h).toBe(tall);
    expect(layout.totalHeight).toBe(estimated.totalHeight + 200);

    const graphs = SELECTION.map((p, i) => buildGraph(p, diff, i, layout));
    const next = diff.rankPlan[diff.rankPlan.indexOf(rank) + 1]!;
    const ys = graphs.map((g) => g.nodes.find((n) => n.data.nodeKey === next)?.position.y);
    expect(new Set(ys).size).toBe(1);
  });

  it('can also shrink a band the estimate over-allocated', () => {
    const measured = new Map<string, number>();
    for (const p of SELECTION) measured.set(nodeId(p, 'end.terminal'), 30);
    expect(computeRankLayout(SELECTION, diff, measured).rows.get('end.terminal')!.h).toBe(30);
  });
});
