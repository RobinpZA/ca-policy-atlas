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
import {
  uncomparedLabel,
  uncomparedPaths,
  type DisplayToken,
  type Expectation,
  type NodeKey,
  type NormalizedPolicy,
  type Polarity,
} from '../types.ts';

// -- geometry ----------------------------------------------------------------
// Deterministic, not measured. Same input, same pixels, every render - which is what
// makes cross-column alignment a property of the layout rather than something that has
// to be maintained at runtime.
export const NODE_W = 292;
export const COL_GAP = 28;
export const COL_PITCH = NODE_W + COL_GAP;

const PAD_X = 12;
const PAD_Y = 8;
const HEAD_PAD_Y = 14;

/** Facet, head and terminal nodes carry a 1px border on all four sides. */
const NODE_BORDER = 2;

/**
 * Content width inside a node.
 *
 * The border counts. `.pnode` sets `width: var(--node-w)` under a global
 * `box-sizing: border-box`, so the 1px border on each side eats the content box along
 * with the padding. Leaving it out made this 268 instead of 266, and two pixels is
 * enough: CAP001's meta row measures 266.8, which fits in 268 and does not fit in 266.
 * The row wrapped, the head grew by a line, and the node landed on the rank below.
 */
const USABLE_W = NODE_W - PAD_X * 2 - NODE_BORDER;

// -- box metrics -------------------------------------------------------------
//
// SINCE 0.3: these produce the FIRST-PASS estimate only. Once a node renders, its real
// height is reported back (state/measure.tsx) and replaces the estimate in
// computeRankLayout, so a drift here now costs one frame of overlap rather than a
// persistent one. The estimate still matters - it is the first paint, and it is the only
// height tests and jsdom ever see - so keep it honest.
//
// EVERY NUMBER BELOW IS MEASURED FROM THE RENDERED PAGE, not estimated, and each one is
// coupled to a specific declaration in flow.css. The coupling is the fragile part: an
// earlier pass assumed 15px line boxes where the CSS actually produced 16.5px (it had no
// `line-height` of its own and inherited body's 1.5), omitted the 3px gap inside .prow
// entirely, and treated the head's meta as plain text lines when it is a wrapping flex
// row with an 8px gap. The result was 461 overlapping nodes across the 94 policies, the
// worst of them 40px into the rank below.
//
// So flow.css now pins an explicit line-height on every element named here, and the
// pairs must be changed together. `tests/layout.spec.ts` pins the arithmetic; the
// browser harness in the redesign notes is what catches a CSS-side drift.
const ROW_LABEL_H = 17; // .prow-label      11px / 1.5 = 16.5 -> 17
const PROW_GAP = 3; // .prow            row-gap
const TOKEN_H = 24; // .token           13px / 1.35 + 4 padding + 2 border
const TOKEN_CHROME_Y = 6; // .token   4px padding + 2px border, once per chip box, any line count
const TOKEN_LINE_H = TOKEN_H - TOKEN_CHROME_Y; // .token   one wrapped text line, chrome excluded
const TOKEN_GAP = 4; // .prow-values     gap
const ROW_GAP = 8; // .pnode           row-gap
const RANK_GAP = 12;

const EYEBROW_H = 17; // .pnode-eyebrow   11px / 1.5 = 16.5 -> 17
const EYEBROW_TICK_W = 2; // .pnode-tick      width, sits in the eyebrow's own flex row
// .pnode-title 22.48px / 1.2 = 26.98, ceiled to 27 - which measured true against the
// shipped corpus (max 114 chars, 5 lines) but only just: the 5-line entries (CAD018,
// CAD006) measure a 0.2px margin, down from 0.6px at 3 lines. That is real measured
// drift, not speculation, and a loaded tenant policy's name is not bounded by the
// corpus - real exports run well past 114 chars. +1px/line trades a sliver of
// harmless whitespace for headroom the corpus cannot prove is unnecessary.
const TITLE_LH = 28;
const META_LH = 17; // .pnode-meta      11px / 1.5 = 16.5 -> 17
const META_GAP = 8; // .pnode-meta      gap between wrapped flex rows
const HEAD_GAP = 6; // .pnode[head]     row-gap
// .pnode-terminal 18.72px / 1.25 = 23.4, ceiled to 24. Same +1px/line reasoning as
// TITLE_LH: a grant terminal's title is built from grantLabels, which can include a
// tenant's own custom authentication-strength name - also unbounded, also untested
// past whatever the corpus happens to ship.
const TERMINAL_LH = 25;
const TERMINAL_SUB_LH = 17; // .pnode-terminal-sub  11px / 1.5

// -- advance widths ----------------------------------------------------------
//
// Mono is exact - the quiet payoff of setting every policy value in a monospace is that
// the chip row is the one measurement in this file that cannot drift.
const CHAR_W_META = 6.6; // JetBrains Mono @ 11px, 0.6em
const CHAR_W_TOKEN = 7.8; // JetBrains Mono @ 13px, 0.6em
/**
 * `.pnode-eyebrow` is the one mono run that also carries `letter-spacing:
 * var(--tracking-label)` (0.08em = 0.88px at 11px), and CSS adds that advance after
 * EVERY character, the last one included. Measuring the eyebrow at CHAR_W_META made a
 * 36-char tenant GUID 237.6 wide against a 266 box - comfortably one line - when it
 * actually renders 269.3 and breaks at a hyphen onto a second.
 */
const CHAR_W_EYEBROW = CHAR_W_META + 0.88;

/**
 * Per-character advance for Newsreader, in em, measured with canvas measureText against
 * the live computed font and normalised by font size.
 *
 * WHY A TABLE AND NOT AN AVERAGE. An average cannot work for a proportional serif here:
 * `l` is 0.279em and `M` is 1.000em, a factor of 3.6. The mean is 0.537em, and using it
 * under-counted the wrapped line count on 17 of the 94 policy names - each miss costing
 * a whole 27px line, which the head node then spent overlapping the rank below. Newsreader
 * is also unusually wide in the capitals, which is exactly what policy names are full of.
 *
 * Normalised to em so the same table serves the 22.5px column head and the 18.7px
 * terminal. Regenerate with the metrics harness if --font-display or its size changes.
 */
const NEWSREADER_EM: Readonly<Record<string, number>> = {
  "'": 0.2, ' ': 0.212, '.': 0.237, ',': 0.243, ':': 0.259, j: 0.264, ';': 0.269,
  l: 0.279, '(': 0.282, ')': 0.282, i: 0.289, '-': 0.346, I: 0.355, f: 0.359,
  t: 0.362, '"': 0.375, s: 0.386, '/': 0.391, r: 0.413, z: 0.442, c: 0.443,
  J: 0.447, e: 0.463, a: 0.468, g: 0.501, '+': 0.506, x: 0.511, o: 0.524,
  v: 0.527, y: 0.532, q: 0.548, b: 0.549, u: 0.549, k: 0.555, d: 0.558,
  p: 0.564, S: 0.566, h: 0.567, n: 0.577,
  0: 0.597, 1: 0.597, 2: 0.597, 3: 0.597, 4: 0.597, 5: 0.597, 6: 0.597,
  7: 0.597, 8: 0.597, 9: 0.597,
  F: 0.601, L: 0.62, P: 0.632, Z: 0.64, E: 0.651, B: 0.671, R: 0.679, T: 0.683,
  C: 0.702, V: 0.704, Y: 0.704, '&': 0.725, A: 0.732, X: 0.734, G: 0.754,
  K: 0.754, w: 0.757, N: 0.757, U: 0.767, D: 0.77, O: 0.777, Q: 0.777,
  H: 0.816, m: 0.837, M: 1, W: 1,
};

/** Anything outside the table - rounded up past the widest glyph, so never optimistic. */
const NEWSREADER_FALLBACK_EM = 1;

const TITLE_SIZE = 22.48; // --text-xl
const TITLE_TRACKING = -0.337; // --tracking-display at TITLE_SIZE
const TERMINAL_SIZE = 18.72; // --text-lg
const TERMINAL_TRACKING = 1.5; // --tracking-label on the block terminal, the widest case

/** Rendered width of a run of text in Newsreader at a given size. */
function textW(text: string, size: number, tracking: number): number {
  let w = 0;
  for (const ch of text) w += (NEWSREADER_EM[ch] ?? NEWSREADER_FALLBACK_EM) * size + tracking;
  return w;
}

/**
 * Lines a proportional string wraps to, by greedy word wrapping on real glyph widths.
 *
 * The previous version divided total text width by the column width, which silently
 * under-counts whenever a word is pushed to the next line early - exactly what happens
 * to long policy names. A word wider than the column breaks inside itself, because
 * .pnode-title sets `overflow-wrap: anywhere`.
 */
function wrapLines(text: string, size: number, tracking: number, width = USABLE_W): number {
  if (!text) return 0;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const spaceW = textW(' ', size, tracking);
  let lines = 1;
  let used = 0;

  for (const word of words) {
    const w = textW(word, size, tracking);

    if (w > width) {
      // Breaks inside itself. Close the current line, then run whole lines out of it.
      if (used > 0) lines++;
      const full = Math.floor(w / width);
      lines += full;
      used = w - full * width;
      if (used === 0) {
        lines--;
        used = width;
      }
      continue;
    }

    if (used === 0) used = w;
    else if (used + spaceW + w > width) {
      lines++;
      used = w;
    } else used += spaceW + w;
  }

  return lines;
}

/** Mono text wraps on a fixed advance, so it needs none of the above. */
function wrapMonoLines(text: string, charW: number, width = USABLE_W): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil((text.length * charW) / width));
}

/** Padding (6px each side) + border (1px each side) a chip spends before text starts. */
const TOKEN_CHROME = 16;

/** Rough rendered width of one value chip: text + 6px padding each side + 1px border each side. */
const tokenW = (label: string): number =>
  Math.min(USABLE_W, label.length * CHAR_W_TOKEN + TOKEN_CHROME);

/**
 * Lines ONE chip's own text wraps into.
 *
 * `.token` sets `overflow-wrap: anywhere`, so a value with no spaces (a raw device-filter
 * expression, a long GUID) does not get held to one line just because it is a single
 * "word" - it breaks inside itself exactly like a title does. `tokenW` deliberately caps
 * at `USABLE_W` for ROW-fitting purposes (such a chip always ends up alone on its row),
 * but that cap must never leak into the height math or a long chip renders taller than
 * its budget and the node overlaps the rank below - the device-filter overflow bug.
 */
function tokenChipLines(label: string): number {
  const w = label.length * CHAR_W_TOKEN;
  return Math.max(1, Math.ceil(w / (USABLE_W - TOKEN_CHROME)));
}

interface FlexWrap {
  /** Flex lines. One `gap` sits between each pair of them. */
  readonly rows: number;
  /** Text lines. One line-height each, and always >= rows. */
  readonly lines: number;
}

/**
 * How a wrapping flex row of text spans lays out: flex lines AND text lines.
 *
 * The two counts differ whenever an item is wider than the box. Such an item takes a
 * flex line to itself and then breaks INSIDE itself - a tenant policy id is a GUID, and
 * its hyphens are break opportunities, so it splits after `...-A314-` and runs onto a
 * second line. Those inner lines are a line-height apart, NOT a `gap` apart, so the
 * height is `lines * LH + (rows - 1) * gap` and collapsing the two under-counts.
 *
 * Treating every span as unbreakable is what let a loaded tenant policy's head render
 * 17px taller than its allocated band and land on top of the rank below.
 */
function flexWrap(widths: readonly number[], gap: number, width = USABLE_W): FlexWrap {
  if (widths.length === 0) return { rows: 1, lines: 1 };
  let rows = 1;
  let lines = 1;
  let used = 0;

  for (const w of widths) {
    if (w > width) {
      if (used > 0) {
        rows++;
        lines++;
      }
      lines += Math.ceil(w / width) - 1;
      // Nothing shares a flex line with an item that fills it, so the next span starts
      // a new row regardless of how much of the last inner line is left over.
      used = width;
      continue;
    }

    if (used === 0) used = w;
    else if (used + gap + w > width) {
      rows++;
      lines++;
      used = w;
    } else used += gap + w;
  }

  return { rows, lines };
}

/**
 * Height of a row of chips: group into visual rows exactly like `flexRows`, but size each
 * resulting row to its tallest chip's OWN line count rather than assuming every chip is
 * one line tall.
 */
function tokenRowsHeight(labels: readonly string[]): number {
  if (labels.length === 0) return 0;
  const items = labels.map((label) => ({ w: tokenW(label), lines: tokenChipLines(label) }));

  const rowMaxLines: number[] = [];
  let used = 0;
  for (const item of items) {
    if (used === 0) {
      rowMaxLines.push(item.lines);
      used = item.w;
    } else if (used + TOKEN_GAP + item.w > USABLE_W) {
      rowMaxLines.push(item.lines);
      used = item.w;
    } else {
      rowMaxLines[rowMaxLines.length - 1] = Math.max(
        rowMaxLines[rowMaxLines.length - 1]!,
        item.lines,
      );
      used += TOKEN_GAP + item.w;
    }
  }

  return (
    rowMaxLines.reduce((h, lines) => h + lines * TOKEN_LINE_H + TOKEN_CHROME_Y, 0) +
    (rowMaxLines.length - 1) * TOKEN_GAP
  );
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
  /** Position in the shared rank plan - drives arrow-key navigation. */
  readonly rankIndex: number;
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

/**
 * Height a node needs for its content.
 *
 * The head and terminal cases were originally fixed constants, which clipped any policy
 * whose title wrapped past two lines - and plenty do. Both now measure their own text.
 */
export function nodeHeight(
  kind: PolicyNodeKind,
  rows: readonly NodeRow[],
  terminal?: Terminal,
  policy?: NormalizedPolicy,
): number {
  if (kind === 'ghost') return 40;

  if (kind === 'head') {
    const titleLines = wrapLines(policy?.name ?? '', TITLE_SIZE, TITLE_TRACKING);

    // .pnode-eyebrow is also a wrapping flex row, not a fixed one-liner. A tenant policy's
    // id is the source GUID (36 chars, no baseline's mnemonic key), which both pushes off
    // the "loaded" tag's line AND - at CHAR_W_EYEBROW's letter-spaced advance - overruns
    // the 266px box and breaks at a hyphen. Three lines where the old math saw one, then
    // two: the bug where loading a JSON export pushed the head node past its budget and
    // it landed on top of the rank below.
    const eyebrowLabel = policy
      ? policy.source === 'tenant'
        ? 'loaded'
        : (policy.baselineKey ?? '')
      : '';
    const eyebrowSpans = [
      EYEBROW_TICK_W,
      eyebrowLabel.length * CHAR_W_EYEBROW,
      (policy?.id ?? '').length * CHAR_W_EYEBROW,
    ];
    const eyebrow = flexWrap(eyebrowSpans, META_GAP);

    // .pnode-meta is a wrapping flex row of unbreakable spans, not a paragraph. Packing
    // the joined string instead of the spans is what under-measured it by 11px.
    const uncompared = policy ? uncomparedPaths(policy).length : 0;
    const metaSpans = [
      policy?.category,
      policy?.priority,
      policy?.profileLevel,
      policy?.state,
      policy?.policyIntent ?? 'Unclassified',
      uncompared ? uncomparedLabel(uncompared) : undefined,
    ]
      .filter((s): s is string => Boolean(s))
      .map((s) => s.length * CHAR_W_META);
    const meta = flexWrap(metaSpans, META_GAP);

    return (
      NODE_BORDER +
      HEAD_PAD_Y * 2 +
      eyebrow.lines * EYEBROW_H +
      (eyebrow.rows - 1) * META_GAP +
      HEAD_GAP +
      titleLines * TITLE_LH +
      HEAD_GAP +
      meta.lines * META_LH +
      (meta.rows - 1) * META_GAP
    );
  }

  if (kind === 'terminal') {
    const titleLines = wrapLines(terminal?.title ?? '', TERMINAL_SIZE, TERMINAL_TRACKING);
    const subLines = terminal?.sub ? wrapMonoLines(terminal.sub, CHAR_W_META) : 0;
    return Math.max(
      56,
      NODE_BORDER +
        PAD_Y * 2 +
        titleLines * TERMINAL_LH +
        subLines * TERMINAL_SUB_LH +
        (subLines > 0 ? 2 : 0),
    );
  }

  let h = NODE_BORDER + PAD_Y * 2;
  rows.forEach((row, i) => {
    if (i > 0) h += ROW_GAP;
    // label, then .prow's own 3px row-gap, then the chip rows. The gap was missing
    // entirely, which cost 3px on every single row of every facet node.
    h += ROW_LABEL_H + PROW_GAP;
    // Marker expectations render one inline glyph rather than a chip list.
    const labels = row.display.length ? row.display.map((d) => d.label) : ['⟨any⟩'];
    h += tokenRowsHeight(labels);
  });
  return Math.max(h, 46);
}

export interface RankLayout {
  /** y offset and height for each rank, shared by EVERY column. */
  readonly rows: ReadonlyMap<NodeKey, { y: number; h: number }>;
  readonly totalHeight: number;
}

/** A node's id: the policy and the DIMENSION, never the value. See buildGraph. */
export const nodeId = (policy: NormalizedPolicy, nodeKey: NodeKey): string =>
  `${policy.policyKey}::${nodeKey}`;

/**
 * One shared vertical layout for the whole board.
 *
 * Each rank takes the height of its tallest column, so a rank occupies the same band
 * in every column. This is the mechanism that makes horizontal scanning - "how do
 * these four baselines differ on Locations?" - actually work.
 *
 * `measured` holds rendered heights by node id, reported by the nodes once they are on
 * screen (state/measure.tsx). Where a node has one it wins; everywhere else - first
 * paint, and every test - the metric estimate from nodeHeight() stands in.
 */
export function computeRankLayout(
  policies: readonly NormalizedPolicy[],
  diff: SelectionDiff,
  measured?: ReadonlyMap<string, number>,
): RankLayout {
  const rows = new Map<NodeKey, { y: number; h: number }>();
  let y = 0;

  for (const nodeKey of diff.rankPlan) {
    let h = 0;
    policies.forEach((policy, col) => {
      const real = measured?.get(nodeId(policy, nodeKey));
      if (real !== undefined) {
        h = Math.max(h, real);
        return;
      }
      const kind = kindOf(nodeKey, policy, diff, col);
      const r = kind === 'facets' ? rowsFor(policy, nodeKey, diff, col) : [];
      const t = nodeKey === 'end.terminal' ? terminalOf(policy.facets) : undefined;
      h = Math.max(h, nodeHeight(kind, r, t, policy));
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
  let rankIndex = -1;

  for (const nodeKey of plan) {
    rankIndex++;
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

    const id = nodeId(policy, nodeKey);

    nodes.push({
      id,
      type: 'policy',
      position: { x: columnIndex * COL_PITCH, y: place.y },
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
        rankIndex,
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

// ---------------------------------------------------------------------------
// Whole board
// ---------------------------------------------------------------------------

export interface BandNodeData extends Record<string, unknown> {
  readonly nodeKey: NodeKey;
  readonly title: string;
  readonly width: number;
}

export interface BoardNode {
  id: string;
  type: 'policy' | 'band';
  position: { x: number; y: number };
  data: PolicyNodeData | BandNodeData;
  draggable: false;
  selectable: false;
  zIndex?: number;
  style?: Record<string, string | number>;
}

export interface BuiltBoard {
  readonly nodes: BoardNode[];
  readonly edges: BuiltGraph['edges'];
  readonly width: number;
  readonly height: number;
}

/**
 * Build every column into ONE canvas.
 *
 * This replaced an earlier design that gave each column its own ReactFlow instance and
 * kept their viewports in step by hand. That approach put the single most important
 * property of the layout - that a rank sits at the same height in every column - at the
 * mercy of mount order and of a viewport-sync effect, and in practice it drifted.
 *
 * With one canvas there is one transform, so alignment and pan/zoom sync are structural
 * rather than maintained. It also deleted the sync store, the driver guard and the
 * per-column fit entirely.
 *
 * Behind the policy nodes sit full-width band nodes, one per rank. They draw the
 * horizontal rule that lets the eye track a single dimension across all the columns,
 * which is the actual reading task.
 */
export function buildBoard(
  policies: readonly NormalizedPolicy[],
  diff: SelectionDiff,
  layout: RankLayout,
): BuiltBoard {
  const width = Math.max(0, policies.length * COL_PITCH - COL_GAP);
  const nodes: BoardNode[] = [];
  const edges: BuiltGraph['edges'] = [];

  for (const nodeKey of diff.rankPlan) {
    const place = layout.rows.get(nodeKey);
    const spec = NODE_SPEC_BY_KEY.get(nodeKey);
    if (!place || !spec) continue;
    nodes.push({
      id: `band::${nodeKey}`,
      type: 'band',
      position: { x: -COL_GAP / 2, y: place.y - RANK_GAP / 2 },
      data: { nodeKey, title: spec.title, width: width + COL_GAP },
      draggable: false,
      selectable: false,
      zIndex: 0,
      style: { width: width + COL_GAP, height: place.h + RANK_GAP },
    });
  }

  policies.forEach((policy, i) => {
    const g = buildGraph(policy, diff, i, layout);
    for (const n of g.nodes) nodes.push({ ...n, zIndex: 1 });
    edges.push(...g.edges);
  });

  return { nodes, edges, width, height: layout.totalHeight };
}

export const RANK_BAND_GAP = RANK_GAP;
