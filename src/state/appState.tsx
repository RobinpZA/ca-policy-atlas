/**
 * App state: a reducer and a context. No store library - React Flow already bundles
 * zustand internally and this is seven fields.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import { BASELINES, MAX_COLUMNS } from '../data/loadBaselines.ts';
import type { NormalizedPolicy, PolicyKey } from '../domain/types.ts';

export type ViewMode = 'flow' | 'table';
export type FilterGroup = 'baseline' | 'category' | 'priority' | 'intent';

export interface AppState {
  readonly selection: readonly PolicyKey[];
  readonly query: string;
  readonly filters: Readonly<Record<FilterGroup, readonly string[]>>;
  readonly view: ViewMode;
  readonly linked: boolean;
  /** Loaded tenant policies. Session-only: never persisted, never put in the URL. */
  readonly loaded: readonly NormalizedPolicy[];
  readonly notice: string | null;
}

export type Action =
  | { type: 'toggle'; key: PolicyKey }
  | { type: 'clear' }
  | { type: 'setSelection'; keys: readonly PolicyKey[] }
  | { type: 'query'; value: string }
  | { type: 'toggleFilter'; group: FilterGroup; value: string }
  | { type: 'clearFilters' }
  | { type: 'view'; value: ViewMode }
  | { type: 'linked'; value: boolean }
  | { type: 'addLoaded'; policies: readonly NormalizedPolicy[] }
  | { type: 'clearLoaded' }
  | { type: 'notice'; value: string | null };

export const initialState: AppState = {
  selection: [],
  query: '',
  filters: { baseline: [], category: [], priority: [], intent: [] },
  view: 'flow',
  linked: true,
  loaded: [],
  notice: null,
};

const toggleIn = (list: readonly string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'toggle': {
      if (state.selection.includes(action.key)) {
        return { ...state, selection: state.selection.filter((k) => k !== action.key) };
      }
      if (state.selection.length >= MAX_COLUMNS) {
        return {
          ...state,
          notice: `Comparison is capped at ${MAX_COLUMNS} columns - beyond that the rows stop being readable. Remove one to add another.`,
        };
      }
      return { ...state, selection: [...state.selection, action.key], notice: null };
    }
    case 'clear':
      return { ...state, selection: [], notice: null };
    case 'setSelection':
      return { ...state, selection: action.keys.slice(0, MAX_COLUMNS) };
    case 'query':
      return { ...state, query: action.value };
    case 'toggleFilter':
      return {
        ...state,
        filters: {
          ...state.filters,
          [action.group]: toggleIn(state.filters[action.group], action.value),
        },
      };
    case 'clearFilters':
      return { ...state, filters: initialState.filters, query: '' };
    case 'view':
      return { ...state, view: action.value };
    case 'linked':
      return { ...state, linked: action.value };
    case 'addLoaded':
      return { ...state, loaded: [...state.loaded, ...action.policies], notice: null };
    case 'clearLoaded':
      return {
        ...state,
        loaded: [],
        selection: state.selection.filter((k) => !k.startsWith('tenant~')),
      };
    case 'notice':
      return { ...state, notice: action.value };
    default:
      return state;
  }
}

// -- hash ---------------------------------------------------------------------

const encodeHash = (s: AppState): string => {
  // Tenant policies are deliberately excluded. A shared link must never carry
  // identifiers from somebody's directory.
  const shareable = s.selection.filter((k) => !k.startsWith('tenant~'));
  const params = new URLSearchParams();
  if (s.query) params.set('q', s.query);
  for (const group of ['baseline', 'category', 'priority', 'intent'] as const) {
    const v = s.filters[group];
    if (v.length) params.set(group[0]!, v.join(','));
  }
  if (s.view !== 'flow') params.set('v', s.view);
  const qs = params.toString();
  return `#/c/${shareable.join(',')}${qs ? `?${qs}` : ''}`;
};

export interface HashState {
  selection: PolicyKey[];
  query: string;
  filters: Record<FilterGroup, string[]>;
  view: ViewMode;
  unknown: string[];
}

export function decodeHash(hash: string): HashState | null {
  const m = /^#\/c\/([^?]*)(?:\?(.*))?$/.exec(hash);
  if (!m) return null;

  const raw = (m[1] ?? '').split(',').filter(Boolean);
  const selection = raw.filter((k) => BASELINES.byKey.has(k));
  const unknown = raw.filter((k) => !BASELINES.byKey.has(k));

  const params = new URLSearchParams(m[2] ?? '');
  const group = (k: string): string[] => (params.get(k) ?? '').split(',').filter(Boolean);

  return {
    selection,
    query: params.get('q') ?? '',
    filters: {
      baseline: group('b'),
      category: group('c'),
      priority: group('p'),
      intent: group('i'),
    },
    view: params.get('v') === 'table' ? 'table' : 'flow',
    unknown,
  };
}

// -- context ------------------------------------------------------------------

const StateCtx = createContext<AppState>(initialState);
const DispatchCtx = createContext<Dispatch<Action>>(() => undefined);

export const useAppState = (): AppState => useContext(StateCtx);
export const useDispatch = (): Dispatch<Action> => useContext(DispatchCtx);

function hydrate(): AppState {
  const parsed = decodeHash(window.location.hash);
  if (!parsed) return initialState;
  return {
    ...initialState,
    selection: parsed.selection.slice(0, MAX_COLUMNS),
    query: parsed.query,
    filters: parsed.filters,
    view: parsed.view,
    notice: parsed.unknown.length
      ? `${parsed.unknown.length} polic${parsed.unknown.length === 1 ? 'y' : 'ies'} in that link no longer exist and were dropped.`
      : null,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, hydrate);

  // replaceState, not pushState: selecting policies would otherwise pile up a history
  // entry per click and make the back button useless.
  useEffect(() => {
    const next = encodeHash(state);
    if (next !== window.location.hash) {
      window.history.replaceState(null, '', next);
    }
  }, [state]);

  // Back/forward still works because the browser fires hashchange for it.
  useEffect(() => {
    const onPop = () => {
      const parsed = decodeHash(window.location.hash);
      if (parsed) dispatch({ type: 'setSelection', keys: parsed.selection });
    };
    window.addEventListener('hashchange', onPop);
    return () => window.removeEventListener('hashchange', onPop);
  }, []);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

/** Every policy the app knows about right now: the 94 baselines plus anything loaded. */
export function useAllPolicies(): readonly NormalizedPolicy[] {
  const { loaded } = useAppState();
  return useMemo(() => [...BASELINES.policies, ...loaded], [loaded]);
}

export function useSelectedPolicies(): readonly NormalizedPolicy[] {
  const { selection } = useAppState();
  const all = useAllPolicies();
  return useMemo(() => {
    const byKey = new Map(all.map((p) => [p.policyKey, p]));
    return selection.map((k) => byKey.get(k)).filter((p): p is NormalizedPolicy => !!p);
  }, [selection, all]);
}
