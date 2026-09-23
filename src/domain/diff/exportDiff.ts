/**
 * A comparison as a file - CSV for a spreadsheet, Markdown for a write-up.
 *
 * Pure over the same SelectionDiff the board and table render, so the export can never
 * disagree with the screen. Two deliberate departures from the screen:
 *
 *  - An unresolved identifier is written in FULL. Truncating a GUID is a display
 *    concession; in a file someone will search for it, and eight characters will not do.
 *  - Absence is written as an empty cell in CSV and as an em dash in Markdown - never as
 *    "false" or "none", which would be claims the policy does not make.
 */

import { FACET_SPEC_BY_PATH, NODE_SPEC_BY_KEY } from '../facetSpecs.ts';
import { uncomparedPaths, type Facet, type NormalizedPolicy } from '../types.ts';
import { REASON_TEXT, type DiffStatus } from './compare.ts';
import type { SelectionDiff } from './diffSelection.ts';
import { summarize } from './summarize.ts';

export type ExportFormat = 'csv' | 'md';

/** Status in words. Chosen to read correctly in a cell with no colour or bar beside it. */
const STATUS_TEXT: Readonly<Record<DiffStatus, string>> = {
  single: '',
  same: 'same',
  missing: 'not stated',
  'differs/coverage': 'not in every column',
  differs: 'differs',
  conflict: 'conflict',
  only: 'only here',
};

/** One cell's value as text. Markers keep the wording the board uses. */
export function valueText(facet: Facet | undefined): string {
  if (!facet) return '';
  switch (facet.exp.kind) {
    case 'wildcard':
      // The board's glyph, not `<any>` - rendered Markdown would eat that as a tag.
      return '⟨any⟩';
    case 'negated':
      return 'not required';
    case 'empty':
      return 'declared, nothing specified';
    default:
      return facet.display.map((d) => (d.resolved ? d.label : d.raw)).join('; ');
  }
}

/**
 * RFC 4180 quoting, plus formula-injection defence: a cell a spreadsheet would evaluate
 * is prefixed with an apostrophe. Tenant data is not ours to trust.
 */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const mdCell = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

const columnName = (p: NormalizedPolicy): string =>
  p.source === 'tenant' ? `${p.name} (loaded)` : `${p.baselineKey ?? ''} ${p.id}`.trim();

interface Row {
  readonly rank: string;
  readonly dimension: string;
  readonly reason: string;
  readonly cells: readonly { readonly value: string; readonly status: string }[];
}

function rowsOf(selected: readonly NormalizedPolicy[], diff: SelectionDiff): Row[] {
  const rows: Row[] = [];
  for (const path of diff.paths) {
    const spec = FACET_SPEC_BY_PATH.get(path);
    const entry = diff.byPath.get(path);
    if (!spec || !entry) continue;
    rows.push({
      rank: NODE_SPEC_BY_KEY.get(spec.node)?.title ?? spec.node,
      dimension: spec.label,
      reason: entry.reason ? REASON_TEXT[entry.reason] : '',
      cells: selected.map((p, i) => ({
        value: valueText(p.facets.get(path)),
        status: STATUS_TEXT[entry.status[i] ?? 'single'],
      })),
    });
  }
  return rows;
}

export function exportCsv(selected: readonly NormalizedPolicy[], diff: SelectionDiff): string {
  const compare = diff.mode === 'compare';
  const header = ['Rank', 'Dimension'];
  if (compare) header.push('Why it differs');
  for (const p of selected) {
    header.push(columnName(p));
    if (compare) header.push(`${columnName(p)} - status`);
  }

  const lines = [header];
  for (const row of rowsOf(selected, diff)) {
    const line = [row.rank, row.dimension];
    if (compare) line.push(row.reason);
    for (const cell of row.cells) {
      line.push(cell.value);
      if (compare) line.push(cell.status);
    }
    lines.push(line);
  }
  return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function exportMarkdown(
  selected: readonly NormalizedPolicy[],
  diff: SelectionDiff,
  generated: Date,
): string {
  const out: string[] = ['# Conditional Access comparison', ''];
  out.push(`Generated ${generated.toISOString()} by CA Policy Atlas.`, '');

  out.push('## Policies', '');
  selected.forEach((p, i) => {
    const bits = [p.source === 'tenant' ? 'loaded' : p.baselineKey, p.state, p.priority]
      .filter(Boolean)
      .join(', ');
    out.push(
      `${i + 1}. **${mdCell(columnName(p))}** - ${mdCell(p.name)}${bits ? ` (${bits})` : ''}`,
    );
    const uncompared = uncomparedPaths(p);
    if (uncompared.length) {
      out.push(
        `   - Not compared (present in the source, not modelled): ${uncompared.map((u) => `\`${u}\``).join(', ')}`,
      );
    }
  });
  out.push('');

  if (diff.mode === 'compare') {
    const s = summarize(diff);
    out.push('## Verdict', '');
    out.push(`${s.dimensions} dimensions, ${s.agree} agree.`);
    if (s.hot.length) {
      out.push('', ...s.hot.map((h) => `- **${h.title}**: ${STATUS_TEXT[h.status]}`));
    }
    out.push('');
  }

  out.push('## Dimensions', '');
  const head = ['Rank', 'Dimension', ...selected.map(columnName)];
  if (diff.mode === 'compare') head.splice(2, 0, 'Why it differs');
  out.push(`| ${head.map(mdCell).join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`);
  for (const row of rowsOf(selected, diff)) {
    const cells = [row.rank, row.dimension];
    if (diff.mode === 'compare') cells.push(row.reason);
    for (const c of row.cells) {
      const value = c.value || '—';
      cells.push(c.status && c.status !== 'same' ? `${value} *(${c.status})*` : value);
    }
    out.push(`| ${cells.map(mdCell).join(' | ')} |`);
  }

  const notes = [...new Set([...diff.byPath.values()].flatMap((e) => e.notes ?? []))];
  if (notes.length) out.push('', '## Notes', '', ...notes.map((n) => `- ${n}`));

  return out.join('\n') + '\n';
}

/** `ca-policy-atlas-20260922-1405.csv` - sortable, and no policy names in a filename. */
export function exportFileName(format: ExportFormat, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `ca-policy-atlas-${stamp}.${format}`;
}
