import { useDeferredValue, useMemo } from 'react';
import { BASELINES, MAX_COLUMNS } from '../../data/loadBaselines.ts';
import {
  useAllPolicies,
  useAppState,
  useDispatch,
  useSelectedPolicies,
  type FilterGroup,
} from '../../state/appState.tsx';
import { LoadPolicies } from '../ui/LoadPolicies.tsx';
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

function Chips({ group, options }: { group: FilterGroup; options: readonly string[] }) {
  const { filters } = useAppState();
  const dispatch = useDispatch();
  const active = filters[group];

  return (
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
  );
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
  return (
    <fieldset className="filter-block" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="filter-legend">{legend}</legend>
      <Chips group={group} options={options} />
    </fieldset>
  );
}

/**
 * A filter group that stays folded until asked for.
 *
 * Intent alone has fifteen values. Rendered open, the filters pushed the policy list -
 * the thing you actually came to use - almost entirely off the bottom of the rail.
 */
function ChipFold({
  legend,
  group,
  options,
}: {
  legend: string;
  group: FilterGroup;
  options: readonly string[];
}) {
  const { filters } = useAppState();
  const count = filters[group].length;

  return (
    <details className="filter-fold" open={count > 0}>
      <summary>
        <span>
          {legend}
          {count > 0 ? <span className="filter-count"> {count}</span> : null}
        </span>
      </summary>
      <Chips group={group} options={options} />
    </details>
  );
}

/**
 * The columns on the board, in board order, pinned above the list.
 *
 * Selected rows used to exist only in place inside the filtered list, so a search could
 * hide a column you were comparing and nothing on screen said what the columns were.
 * Filters apply to the list below this; they never touch the selection.
 */
function SelectedTray() {
  const selected = useSelectedPolicies();
  const dispatch = useDispatch();
  if (selected.length === 0) return null;

  return (
    <section className="rail-selected" aria-label="Selected policies">
      <div className="rail-selected-head">
        <span className="eyebrow">
          Selected · {selected.length} / {MAX_COLUMNS}
        </span>
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() => dispatch({ type: 'clear' })}
        >
          Clear
        </button>
      </div>
      <ol className="selected-list">
        {selected.map((p, i) => (
          <li key={p.policyKey} className="selected-item">
            <span className="selected-col" aria-hidden="true">
              {i + 1}
            </span>
            <span className="selected-text">
              <span className="policy-id">
                <span>{p.id}</span>
                {p.source === 'tenant' ? (
                  <span className="tenant-flag">loaded</span>
                ) : (
                  <span>{p.baselineKey}</span>
                )}
              </span>
              <span className="selected-name" title={p.fullName ?? p.name}>
                {p.name}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-quiet btn-sm selected-remove"
              aria-label={`Remove ${p.id} from the comparison`}
              title="Remove from the comparison"
              onClick={() => dispatch({ type: 'toggle', key: p.policyKey })}
            >
              ×
            </button>
          </li>
        ))}
      </ol>
    </section>
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
        {/* Loading adds policies to this list, so the control lives with the list. */}
        <LoadPolicies />
        <ChipRow
          legend="Baseline"
          group="baseline"
          options={state.loaded.length ? [...baselineKeys, 'Loaded'] : baselineKeys}
        />
        <ChipFold legend="Category" group="category" options={CATEGORIES} />
        <ChipFold legend="Priority" group="priority" options={PRIORITIES} />
        <ChipFold legend="Intent" group="intent" options={intents} />
      </div>

      <SelectedTray />

      <div className="rail-count">
        <span>
          {visible.length} of {all.length}
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

      {/* A plain list of toggles, NOT role="listbox".
       *
       * It was a listbox of role="option" items each wrapping a <button>, which axe
       * fails twice over: a focusable control inside an option is nested-interactive,
       * and aria-selected is not an allowed attribute on a button. A listbox also
       * promises arrow-key roving focus that this list does not implement. What each row
       * actually is, is a checkbox - so it says so, and Tab/Space behave as expected. */}
      <ul className="policy-list" aria-label="Policies">
        {visible.map((p) => {
          const selected = state.selection.includes(p.policyKey);
          return (
            <li key={p.policyKey}>
              <button
                type="button"
                className="policy-row"
                role="checkbox"
                aria-checked={selected}
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
