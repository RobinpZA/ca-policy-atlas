import { useDeferredValue, useMemo } from 'react';
import { BASELINES, MAX_COLUMNS } from '../../data/loadBaselines.ts';
import {
  useAllPolicies,
  useAppState,
  useDispatch,
  type FilterGroup,
} from '../../state/appState.tsx';
import type { NormalizedPolicy } from '../../domain/types.ts';

const CATEGORIES = ['Prerequisite', 'User', 'Device', 'Location'] as const;
const PRIORITIES = ['Must Have', 'Should Have', 'Could Have'] as const;
const UNCLASSIFIED = 'Unclassified';

/** Intents actually present in the corpus, plus a bucket for the three with none. */
function intentOptions(policies: readonly NormalizedPolicy[]): string[] {
  const set = new Set<string>();
  let hasUnclassified = false;
  for (const p of policies) {
    if (p.policyIntent) set.add(p.policyIntent);
    else hasUnclassified = true;
  }
  const list = [...set].sort();
  return hasUnclassified ? [...list, UNCLASSIFIED] : list;
}

function matches(p: NormalizedPolicy, q: string): boolean {
  if (!q) return true;
  const hay = [p.id, p.name, p.fullName ?? '', p.description ?? '', ...(p.keywords ?? [])]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function ChipRow({
  legend,
  group,
  options,
}: {
  legend: string;
  group: FilterGroup;
  options: readonly string[];
}) {
  const { filters } = useAppState();
  const dispatch = useDispatch();
  const active = filters[group];

  return (
    <fieldset className="filter-block" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="filter-legend">{legend}</legend>
      <div className="chips">
        {options.map((value) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={active.includes(value)}
            onClick={() => dispatch({ type: 'toggleFilter', group, value })}
          >
            {value}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function PolicyPicker() {
  const state = useAppState();
  const dispatch = useDispatch();
  const all = useAllPolicies();
  const query = useDeferredValue(state.query.trim().toLowerCase());

  const intents = useMemo(() => intentOptions(BASELINES.policies), []);
  const baselineKeys = useMemo(() => BASELINES.meta.map((m) => m.key), []);

  const visible = useMemo(() => {
    const { filters } = state;
    return all.filter((p) => {
      if (!matches(p, query)) return false;
      if (filters.baseline.length) {
        const key = p.source === 'tenant' ? 'Loaded' : (p.baselineKey ?? '');
        if (!filters.baseline.includes(key)) return false;
      }
      if (filters.category.length && !filters.category.includes(p.category ?? '')) return false;
      if (filters.priority.length && !filters.priority.includes(p.priority ?? '')) return false;
      if (filters.intent.length) {
        const intent = p.policyIntent ?? UNCLASSIFIED;
        if (!filters.intent.includes(intent)) return false;
      }
      return true;
    });
  }, [all, query, state]);

  const atCap = state.selection.length >= MAX_COLUMNS;
  const hasFilters =
    state.query !== '' || Object.values(state.filters).some((v) => v.length > 0);

  return (
    <aside className="rail" aria-label="Policy picker">
      <div className="rail-head">
        <input
          className="search"
          type="search"
          placeholder="Search 94 policies…"
          aria-label="Search policies by name, id, description or keyword"
          value={state.query}
          onChange={(e) => dispatch({ type: 'query', value: e.target.value })}
        />
        <ChipRow
          legend="Baseline"
          group="baseline"
          options={state.loaded.length ? [...baselineKeys, 'Loaded'] : baselineKeys}
        />
        <ChipRow legend="Category" group="category" options={CATEGORIES} />
        <ChipRow legend="Priority" group="priority" options={PRIORITIES} />
        <ChipRow legend="Intent" group="intent" options={intents} />
      </div>

      <div className="rail-count">
        <span>
          {visible.length} of {all.length}
          {state.selection.length > 0 ? ` · ${state.selection.length} selected` : ''}
        </span>
        {hasFilters ? (
          <button
            type="button"
            className="btn btn-quiet"
            style={{ height: 24 }}
            onClick={() => dispatch({ type: 'clearFilters' })}
          >
            Reset
          </button>
        ) : null}
      </div>

      <ul className="policy-list" role="listbox" aria-multiselectable="true" aria-label="Policies">
        {visible.map((p) => {
          const selected = state.selection.includes(p.policyKey);
          return (
            <li key={p.policyKey} role="option" aria-selected={selected}>
              <button
                type="button"
                className="policy-row"
                aria-selected={selected}
                disabled={!selected && atCap}
                title={
                  !selected && atCap
                    ? `Comparison is capped at ${MAX_COLUMNS} columns. Remove one first.`
                    : (p.fullName ?? p.name)
                }
                onClick={() => dispatch({ type: 'toggle', key: p.policyKey })}
              >
                <span className="policy-mark" aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
                <span>
                  <span className="policy-id">
                    <span>{p.id}</span>
                    {p.source === 'tenant' ? (
                      <span className="tenant-flag">loaded</span>
                    ) : (
                      <span>{p.baselineKey}</span>
                    )}
                  </span>
                  <span className="policy-name">{p.name}</span>
                </span>
              </button>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li style={{ padding: 'var(--space-md)', color: 'var(--color-neutral)' }}>
            Nothing matches those filters.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}
