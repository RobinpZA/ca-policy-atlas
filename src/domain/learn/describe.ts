/**
 * A policy, read aloud: one line per rank, in rank order.
 *
 * Works on any FacetMap - a draft, a baseline, a tenant policy - so Anatomy can read a
 * real baseline with the same words the builder uses for a draft.
 *
 * Absent, wildcard and empty get three different sentences. "No condition", "any value
 * you choose" and "declared, but empty" are three different claims, and a readout that
 * blurred them would teach the wrong thing.
 */

import { FACETS_BY_NODE, NODE_SPECS } from '../facetSpecs.ts';
import { terminalOf } from '../graph/terminal.ts';
import type { Facet, FacetMap, NodeKey } from '../types.ts';
import { ANATOMY } from './anatomy.ts';
import { BUILDER_SPECS } from './draft.ts';

export interface ReadoutLine {
  readonly node: NodeKey;
  readonly title: string;
  readonly text: string;
  /** Nothing in the policy speaks to this rank. */
  readonly absent: boolean;
}

/** `a`, `a or b`, `a, b or c`. */
export function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

export function phrase(f: Facet): string {
  switch (f.exp.kind) {
    case 'wildcard':
      return 'any value you choose';
    case 'negated':
      return 'explicitly not required';
    case 'empty':
      return 'declared, but empty';
    default:
      return joinOr(f.display.map((d) => d.label));
  }
}

/** Ranks the builder offers. Only these say "not set" aloud when empty. */
const BUILDER_NODES: ReadonlySet<NodeKey> = new Set(BUILDER_SPECS.map((s) => s.node));

function nodeText(facets: readonly Facet[]): string {
  const included = facets.filter((f) => f.polarity === 'include').map(phrase);
  const excluded = facets.filter((f) => f.polarity === 'exclude').map(phrase);
  const other = facets
    .filter((f) => f.polarity !== 'include' && f.polarity !== 'exclude')
    .map((f) => `${f.label}: ${phrase(f)}`);

  const parts: string[] = [];
  if (included.length) parts.push(included.join('; '));
  else if (excluded.length) parts.push('Nothing included');
  if (excluded.length) parts.push(`except ${excluded.join('; ')}`);
  const scope = parts.join(' ');
  return [scope, ...other].filter(Boolean).join('. ');
}

export function describePolicy(facets: FacetMap): readonly ReadoutLine[] {
  const lines: ReadoutLine[] = [];

  for (const node of NODE_SPECS) {
    if (node.key === 'policy.head') continue;

    if (node.key === 'end.terminal') {
      const t = terminalOf(facets);
      lines.push({
        node: node.key,
        title: node.title,
        text: t.sub ? `${t.title} (${t.sub})` : t.title,
        absent: t.tone === 'none',
      });
      continue;
    }

    const present = (FACETS_BY_NODE.get(node.key) ?? [])
      .map((p) => facets.get(p))
      .filter((f): f is Facet => !!f);

    if (!present.length) {
      if (BUILDER_NODES.has(node.key)) {
        lines.push({ node: node.key, title: node.title, text: ANATOMY[node.key].unset, absent: true });
      }
      continue;
    }

    lines.push({ node: node.key, title: node.title, text: nodeText(present), absent: false });
  }

  return lines;
}
