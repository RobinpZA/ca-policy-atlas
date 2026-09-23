import { useMemo, useState } from 'react';
import { BASELINES } from '../../data/loadBaselines.ts';
import { coverageReport, type CoverageStatus } from '../../domain/diff/coverage.ts';
import { FACET_SPEC_BY_PATH } from '../../domain/facetSpecs.ts';
import { useAppState, useDispatch } from '../../state/appState.tsx';

const STATUS_WORD: Readonly<Record<CoverageStatus, string>> = {
  covered: 'covered',
  partial: 'partial',
  uncovered: 'not covered',
};

/** Same bar widths as the table view: the less covered, the heavier the bar. */
const STATUS_CLASS: Readonly<Record<CoverageStatus, string>> = {
  covered: 'cell-same',
  partial: 'cell-coverage',
  uncovered: 'cell-only',
};

const labelOf = (path: string): string => FACET_SPEC_BY_PATH.get(path)?.label ?? path;

/**
 * Baseline coverage: the question people loading a tenant export are usually asking.
 *
 * For each policy in one baseline, the loaded policy that comes closest and what it
 * leaves unmet. The scoring rules live in domain/diff/coverage.ts; this only lays them out
 * and hands off to the side-by-side view, which is where a partial match gets judged.
 */
export function CoverageView() {
  const { loaded } = useAppState();
  const dispatch = useDispatch();
  const [baselineKey, setBaselineKey] = useState(BASELINES.meta[0]?.key ?? '');

  const meta = BASELINES.meta.find((m) => m.key === baselineKey);
  const report = useMemo(
    () =>
      coverageReport(
        BASELINES.policies.filter((p) => p.baselineKey === baselineKey),
        loaded,
      ),
    [baselineKey, loaded],
  );

  if (loaded.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing loaded to measure</h2>
        <p>
          Coverage checks your own policies against a baseline. Use <strong>Load JSON</strong> with
          a Conditional Access export - Graph&rsquo;s <code>{'{ value: [...] }'}</code> response
          works as-is. It stays in this browser.
        </p>
      </div>
    );
  }

  const { covered, partial, uncovered } = report.counts;

  return (
    <div className="table-wrap">
      <div className="coverage-bar">
        <div className="toggle-group" role="group" aria-label="Baseline to measure against">
          {BASELINES.meta.map((m) => (
            <button
              key={m.key}
              type="button"
              className="btn"
              aria-pressed={m.key === baselineKey}
              title={m.label}
              onClick={() => setBaselineKey(m.key)}
            >
              {m.short}
            </button>
          ))}
        </div>
        <p className="coverage-summary" role="status">
          <strong>{covered}</strong> covered · <strong>{partial}</strong> partial ·{' '}
          <strong>{uncovered}</strong> not covered, of {report.rows.length} {meta?.label ?? ''}{' '}
          policies, against {loaded.length} loaded.
        </p>
      </div>

      <table className="diff">
        <caption>
          A requirement is met when your policy states the same thing, or when the baseline leaves
          the value to you and you have set one. A broader value - All where the baseline says
          Office 365 - is not counted as meeting it; compare the pair to judge.
        </caption>
        <thead>
          <tr>
            <th scope="col">Baseline policy</th>
            <th scope="col">Closest loaded policy</th>
            <th scope="col">Met</th>
            <th scope="col">Unmet</th>
            <th scope="col">
              <span className="visually-hidden">Compare</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {report.rows.map(({ baseline, best, required, status }) => (
            <tr key={baseline.policyKey}>
              <th scope="row" className={STATUS_CLASS[status]}>
                <span className="filter-legend" style={{ display: 'block' }}>
                  {baseline.id} · {STATUS_WORD[status]}
                </span>
                {baseline.name}
              </th>
              <td>
                {best ? (
                  <>
                    {best.tenant.name}
                    {best.tenant.state && best.tenant.state !== 'enabled' ? (
                      <span className="cell-reason">{best.tenant.state}</span>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td className="cell-num">
                {best?.met.length ?? 0} / {required}
              </td>
              <td>
                {best ? (
                  <span className="cell-values">
                    {best.conflict.map((p) => (
                      <span key={p} className="token" title="Your policy asserts the opposite">
                        ⊥ {labelOf(p)}
                      </span>
                    ))}
                    {best.unmet.map((p) => (
                      <span key={p} className="token">
                        {labelOf(p)}
                      </span>
                    ))}
                  </span>
                ) : (
                  'everything'
                )}
              </td>
              <td>
                {best ? (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    title={`Open ${baseline.id} and ${best.tenant.name} side by side`}
                    onClick={() => {
                      dispatch({
                        type: 'setSelection',
                        keys: [baseline.policyKey, best.tenant.policyKey],
                      });
                      dispatch({ type: 'view', value: 'flow' });
                    }}
                  >
                    Compare
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
