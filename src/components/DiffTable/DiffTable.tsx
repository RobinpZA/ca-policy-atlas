import { useMemo } from 'react';
import { diffSelection } from '../../domain/diff/diffSelection.ts';
import { FACET_SPEC_BY_PATH, NODE_SPEC_BY_KEY } from '../../domain/facetSpecs.ts';
import { useSelectedPolicies } from '../../state/appState.tsx';
import { REASON_TEXT, type DiffStatus, type ValueDiff } from '../../domain/diff/compare.ts';
import { uncomparedLabel, uncomparedPaths, type Facet } from '../../domain/types.ts';

const CELL_CLASS: Record<DiffStatus, string> = {
  same: 'cell-same',
  missing: 'cell-missing',
  differs: 'cell-differs',
  'differs/coverage': 'cell-coverage',
  conflict: 'cell-conflict',
  only: 'cell-only',
  single: '',
};

function Value({ facet, valueDiff }: { facet: Facet | undefined; valueDiff?: ValueDiff }) {
  if (!facet) return <>—</>;
  switch (facet.exp.kind) {
    case 'wildcard':
      return <span className="marker">⟨any⟩</span>;
    case 'negated':
      return <span className="marker">not required</span>;
    case 'empty':
      return <span className="marker">declared, nothing specified</span>;
    default: {
      // Chips, as on the board: a value every column shares recedes, so the ones that
      // make this row differ are what the eye lands on.
      const shared = new Set((valueDiff?.shared ?? []).map((v) => v.toLowerCase()));
      return (
        <span className="cell-values">
          {facet.display.map((token, i) => (
            <span
              key={`${token.raw}-${i}`}
              className="token"
              data-resolved={token.resolved}
              data-shared={valueDiff ? shared.has(token.raw.toLowerCase()) : undefined}
              title={token.resolved ? token.raw : `Unresolved identifier: ${token.raw}`}
            >
              {token.label}
            </span>
          ))}
        </span>
      );
    }
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
            {selected.map((p) => {
              const uncompared = uncomparedPaths(p);
              return (
                <th scope="col" key={p.policyKey}>
                  {p.id}
                  <span className="visually-hidden"> {p.name}</span>
                  {uncompared.length > 0 ? (
                    <span
                      className="pnode-uncompared"
                      style={{ display: 'block' }}
                      title={`Present in the source, not modelled, so not compared:\n${uncompared.join('\n')}`}
                    >
                      {uncomparedLabel(uncompared.length)}
                    </span>
                  ) : null}
                </th>
              );
            })}
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
                    <span className="cell-reason">{REASON_TEXT[entry.reason]}</span>
                  ) : null}
                </th>
                {selected.map((p, i) => {
                  const status = entry.status[i] ?? 'single';
                  const valueDiff = entry.valueDiff?.[i];
                  return (
                    <td key={p.policyKey} className={CELL_CLASS[status]}>
                      <Value facet={p.facets.get(path)} {...(valueDiff ? { valueDiff } : {})} />
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
