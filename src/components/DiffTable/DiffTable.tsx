import { useMemo } from 'react';
import { diffSelection } from '../../domain/diff/diffSelection.ts';
import { FACET_SPEC_BY_PATH, NODE_SPEC_BY_KEY } from '../../domain/facetSpecs.ts';
import { useSelectedPolicies } from '../../state/appState.tsx';
import type { DiffStatus } from '../../domain/diff/compare.ts';
import type { Facet } from '../../domain/types.ts';

const CELL_CLASS: Record<DiffStatus, string> = {
  same: 'cell-same',
  missing: 'cell-missing',
  differs: 'cell-differs',
  'differs/coverage': 'cell-coverage',
  conflict: 'cell-conflict',
  only: 'cell-only',
  single: '',
};

function renderValue(facet: Facet | undefined): string {
  if (!facet) return '—';
  switch (facet.exp.kind) {
    case 'wildcard':
      return '⟨any⟩';
    case 'negated':
      return 'not required';
    case 'empty':
      return 'declared, nothing specified';
    default:
      return facet.display.map((d) => d.label).join(', ');
  }
}

/**
 * The same diff, as a table.
 *
 * This is both the accessible equivalent of the graph board and the cheapest way to
 * eyeball whether the diff is correct - one component doing two jobs.
 */
export function DiffTable() {
  const selected = useSelectedPolicies();
  const diff = useMemo(() => diffSelection(selected), [selected]);

  // Precomputed rather than accumulated during render: a mutable cursor inside .map()
  // happens to work but breaks the moment rendering is interrupted or replayed.
  const rankStarts = useMemo(() => {
    const starts = new Set<string>();
    let previous: string | undefined;
    for (const path of diff.paths) {
      const node = FACET_SPEC_BY_PATH.get(path)?.node;
      if (node && node !== previous) starts.add(path);
      previous = node;
    }
    return starts;
  }, [diff]);

  if (selected.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing selected yet</h2>
        <p>Pick policies from the list to see them compared row by row.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="diff">
        <caption>
          {diff.paths.length} dimension{diff.paths.length === 1 ? '' : 's'} asserted across{' '}
          {selected.length} polic{selected.length === 1 ? 'y' : 'ies'}. A dash means the policy
          does not mention that dimension at all, which is different from asserting nothing.
        </caption>
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            {selected.map((p) => (
              <th scope="col" key={p.policyKey}>
                {p.id}
                <span className="visually-hidden"> {p.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {diff.paths.map((path) => {
            const spec = FACET_SPEC_BY_PATH.get(path);
            const entry = diff.byPath.get(path);
            if (!spec || !entry) return null;

            const isNewRank = rankStarts.has(path);
            const rankTitle = NODE_SPEC_BY_KEY.get(spec.node)?.title ?? '';

            return (
              <tr key={path} className={isNewRank ? 'rank-start' : undefined}>
                <th scope="row">
                  {isNewRank ? (
                    <span className="filter-legend" style={{ display: 'block' }}>
                      {rankTitle}
                    </span>
                  ) : null}
                  {spec.label}
                  {entry.reason ? (
                    <span className="visually-hidden"> ({entry.reason})</span>
                  ) : null}
                </th>
                {selected.map((p, i) => {
                  const status = entry.status[i] ?? 'single';
                  return (
                    <td key={p.policyKey} className={CELL_CLASS[status]}>
                      {renderValue(p.facets.get(path))}
                      {status === 'only' ? (
                        <span className="prow-flag"> only here</span>
                      ) : null}
                      {status === 'conflict' ? (
                        <span className="prow-flag"> &#8869;</span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {[...diff.byPath.values()].some((e) => e.notes?.length) ? (
        <ul style={{ marginTop: 'var(--space-lg)', color: 'var(--color-neutral)', fontSize: 'var(--text-sm)' }}>
          {[...new Set([...diff.byPath.values()].flatMap((e) => e.notes ?? []))].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
