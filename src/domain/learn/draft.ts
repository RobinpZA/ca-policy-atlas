/**
 * The Learn builder's draft policy, and the one road out of it: Graph JSON.
 *
 * A draft is written as Graph JSON and read back through normalizeGraphPolicy, the same
 * adapter a real tenant export takes. So a draft compares, scores and renders exactly
 * like a loaded policy, and the builder cannot drift into its own idea of what a
 * policy means.
 */

import { COPY_PAIRS, normalizeGraphPolicy } from '../adapters/fromGraph.ts';
import { FACET_SPECS } from '../facetSpecs.ts';
import { knownValues } from '../labels.ts';
import { setPath } from '../objectPath.ts';
import type {
  FacetSpec,
  NormalizedPolicy,
  PolicyState,
  RawObject,
  RawValue,
  TokenKind,
} from '../types.ts';

export const BUILDER_SPECS: readonly FacetSpec[] = FACET_SPECS.filter((s) => s.builder);

export interface Draft {
  readonly name: string;
  readonly state: PolicyState;
  /** Facet path -> chosen raw values. A missing or empty slot is ABSENT, never `[]`. */
  readonly slots: Readonly<Record<string, readonly string[]>>;
}

export const EMPTY_DRAFT: Draft = { name: 'My draft policy', state: 'reportOnly', slots: {} };

const INTERVAL_PATH = 'sessionControls.signInFrequency.interval';
const BROWSER_MODE_PATH = 'sessionControls.persistentBrowser.mode';

/** The readable intervals fromGraph's signInInterval produces, so they round-trip. */
const INTERVALS: readonly string[] = ['every time', '1 hour', '4 hours', '12 hours', '1 day', '7 days'];

/**
 * Clearly synthetic stand-ins for tenant objects. A real group or named location is a
 * GUID only that tenant can resolve, and inventing one would be worse than useless.
 */
const EXAMPLES: Partial<Record<TokenKind, readonly string[]>> = {
  identity: ['Break-glass accounts (example)', 'Pilot group (example)'],
  location: ['Head office (example)'],
};

/** Graph keywords that only mean something in a users slot, never a groups slot. */
const USER_KEYWORDS: ReadonlySet<string> = new Set([
  'all',
  'none',
  'guestsorexternalusers',
  'allagentidusers',
]);

/** Graph's placeholder for enum growth. Not something a person chooses. */
const NOT_A_CHOICE = 'unknownfuturevalue';

/** A slot that holds one value: the next drop replaces it. */
export const isSingle = (spec: FacetSpec): boolean =>
  spec.tokenKind === 'operator' ||
  spec.tokenKind === 'persistentBrowserMode' ||
  spec.path === INTERVAL_PATH;

/** The chips offered for a slot. */
export function paletteFor(spec: FacetSpec): readonly string[] {
  if (spec.path === INTERVAL_PATH) return INTERVALS;
  const values = [...knownValues(spec.tokenKind), ...(EXAMPLES[spec.tokenKind] ?? [])].filter(
    (v) => v.toLowerCase() !== NOT_A_CHOICE,
  );
  return values.filter((v) => accepts(spec, v));
}

/** Whether a slot takes a value. Drag and click-to-place both ask this. */
export function accepts(spec: FacetSpec, value: string): boolean {
  if (spec.path === INTERVAL_PATH) return INTERVALS.includes(value);
  if (spec.tokenKind === 'identity' && USER_KEYWORDS.has(value.toLowerCase())) {
    return spec.path.endsWith('Users');
  }
  return (
    knownValues(spec.tokenKind).some((k) => k.toLowerCase() === value.toLowerCase()) ||
    (EXAMPLES[spec.tokenKind] ?? []).includes(value)
  );
}

/** Add a value to a slot. Single-value slots replace; lists ignore duplicates. */
export function place(draft: Draft, spec: FacetSpec, value: string): Draft {
  if (!accepts(spec, value)) return draft;
  const current = draft.slots[spec.path] ?? [];
  const next = isSingle(spec)
    ? [value]
    : current.some((v) => v.toLowerCase() === value.toLowerCase())
      ? current
      : [...current, value];
  return { ...draft, slots: { ...draft.slots, [spec.path]: next } };
}

export function removeValue(draft: Draft, path: string, value: string): Draft {
  const next = (draft.slots[path] ?? []).filter((v) => v !== value);
  const slots = { ...draft.slots };
  if (next.length) slots[path] = next;
  else delete slots[path];
  return { ...draft, slots };
}

const GRAPH_STATE: Readonly<Record<PolicyState, string>> = {
  enabled: 'enabled',
  reportOnly: 'enabledForReportingButNotEnforced',
  disabled: 'disabled',
};

/** Canonical path -> Graph path: COPY_PAIRS read backwards. */
const GRAPH_PATH: ReadonlyMap<string, string> = new Map(COPY_PAIRS.map(([from, to]) => [to, from]));

function intervalToGraph(interval: string): RawObject {
  if (interval === 'every time') return { isEnabled: true, frequencyInterval: 'everyTime' };
  const m = /^(\d+) (hour|day)s?$/.exec(interval);
  if (!m) throw new Error(`Unknown sign-in frequency interval: ${interval}`);
  return {
    isEnabled: true,
    frequencyInterval: 'timeBased',
    value: Number(m[1]),
    type: `${m[2]}s`,
  };
}

export function draftToGraph(draft: Draft): RawObject {
  const out: Record<string, RawValue> = {
    displayName: draft.name,
    state: GRAPH_STATE[draft.state],
  };

  for (const spec of BUILDER_SPECS) {
    const values = draft.slots[spec.path];
    if (!values?.length) continue;

    if (spec.path === INTERVAL_PATH) {
      setPath(out, 'sessionControls.signInFrequency', intervalToGraph(values[0]!));
      continue;
    }

    const graphPath = GRAPH_PATH.get(spec.path);
    if (!graphPath) throw new Error(`No Graph path for builder facet ${spec.path}`);
    setPath(out, graphPath, isSingle(spec) ? values[0]! : [...values]);

    // Graph only honours a browser mode when the control itself is switched on.
    if (spec.path === BROWSER_MODE_PATH) {
      setPath(out, 'sessionControls.persistentBrowser.isEnabled', true);
    }
  }

  return out;
}

/** The draft as the rest of the app sees it, via the same adapter as a tenant export. */
export const draftToPolicy = (draft: Draft, index: number): NormalizedPolicy =>
  normalizeGraphPolicy(draftToGraph(draft), index);

const has = (draft: Draft, path: string): boolean => (draft.slots[path]?.length ?? 0) > 0;

/**
 * What stops Entra saving this policy, in the order a person would fix it. These are
 * Entra's own validation rules, not best practice - best practice is what the
 * challenges and the baselines are for.
 */
export function draftProblems(draft: Draft): readonly string[] {
  const problems: string[] = [];
  const controls = draft.slots['grantControls.builtInControls'] ?? [];
  const hasSession = BUILDER_SPECS.some(
    (s) => s.node === 'ctrl.session' && has(draft, s.path),
  );

  if (!has(draft, 'users.includeUsers') && !has(draft, 'users.includeGroups')) {
    problems.push('Choose who it applies to: put users or groups in an Include slot.');
  }
  if (!has(draft, 'applications.includeApplications')) {
    problems.push('Choose target apps: put at least one app in Include apps.');
  }
  if (!controls.length && !hasSession) {
    problems.push('Add a grant or session control. Without one the policy does nothing.');
  }
  if (controls.some((c) => c.toLowerCase() === 'block') && controls.length > 1) {
    problems.push('Block cannot be combined with other grant controls.');
  }
  if (controls.length > 1 && !has(draft, 'grantControls.operator')) {
    problems.push('Several grant controls need an operator: all of them (AND) or any one (OR).');
  }
  if (has(draft, 'platforms.excludePlatforms') && !has(draft, 'platforms.includePlatforms')) {
    problems.push('Excluding platforms needs an Include platforms value, usually All platforms.');
  }
  if (
    has(draft, 'conditions.locations.excludeLocations') &&
    !has(draft, 'conditions.locations.includeLocations')
  ) {
    problems.push('Excluding locations needs an Include locations value, usually All locations.');
  }
  return problems;
}
