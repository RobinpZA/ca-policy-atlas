/**
 * Expectation-level comparison.
 *
 * Every judgement about what counts as "the same" lives here, in one place, so the
 * semantics can be read and argued with rather than reverse-engineered from behaviour.
 */

import type { Expectation, Facet } from '../types.ts';
import { isValued } from '../types.ts';

export type DiffStatus =
  | 'single' // only one policy selected - nothing to compare against
  | 'same' // present in every column, identical
  | 'missing' // absent here, present somewhere else
  | 'differs/coverage' // equal among the columns that have it, but not every column has it
  | 'differs' // present in 2+, values disagree
  | 'conflict' // present in 2+, polarities oppose
  | 'only'; // present in exactly one column

export type DiffReason = 'polarity' | 'unspecified' | 'specificity' | 'value';

/** Higher wins when rolling facet statuses up to a node. */
export const SEVERITY: Readonly<Record<DiffStatus, number>> = {
  only: 5,
  conflict: 4,
  differs: 3,
  'differs/coverage': 3,
  missing: 2,
  same: 1,
  single: 0,
};

export const moreSevere = (a: DiffStatus, b: DiffStatus): DiffStatus =>
  SEVERITY[a] >= SEVERITY[b] ? a : b;

/** Canonical value list for a valued expectation; scalars promote to a singleton set. */
export const valuesOf = (exp: Expectation): readonly string[] => {
  if (exp.kind === 'set') return exp.values;
  if (exp.kind === 'scalar') return [exp.value];
  return [];
};

const lowerSet = (values: readonly string[]): Set<string> =>
  new Set(values.map((v) => v.toLowerCase()));

/**
 * Known containment relationships between application identifiers.
 *
 * These deliberately do NOT change the diff status. A baseline asserting `Office365`
 * and one asserting `All` are making different assertions, and silently calling them
 * equal would be the tool making a judgement on the user's behalf. Instead the
 * difference stands and we attach a note explaining the relationship, so the reader
 * can decide whether it matters to them.
 */
const SUBSUMES: ReadonlyArray<readonly [string, string, string]> = [
  ['all', 'office365', 'All Cloud Apps includes the Office 365 suite'],
  ['all', 'microsoftadminportals', 'All Cloud Apps includes Microsoft Admin Portals'],
  ['all', 'alltrusted', 'All locations includes all trusted locations'],
];

export function subsumptionNotes(exps: readonly Expectation[]): readonly string[] {
  const present = new Set<string>();
  for (const e of exps) for (const v of valuesOf(e)) present.add(v.toLowerCase());

  const notes: string[] = [];
  for (const [broad, narrow, note] of SUBSUMES) {
    if (present.has(broad) && present.has(narrow)) notes.push(note);
  }
  return notes;
}

export interface GroupResult {
  readonly allEqual: boolean;
  readonly status?: Extract<DiffStatus, 'differs' | 'conflict'>;
  readonly reason?: DiffReason;
  readonly notes?: readonly string[];
}

/**
 * Compare the 2+ facets that actually exist at one path.
 *
 * Decision table, and the reasoning for each:
 *
 *   identical (kind + canonical key)  -> equal
 *     Canonical keys are case-folded, de-duplicated and sorted, so ["high","medium"]
 *     and ["medium","high"] are equal. Both orderings occur in the shipped corpus, so
 *     this is fixing a live false positive, not guarding against a hypothetical one.
 *
 *   negated vs anything positive      -> conflict
 *     Opposite polarity. The one real instance is deviceState.requireCompliant true vs
 *     false: one policy targets compliant devices, the other targets non-compliant ones.
 *     Surfacing that is the entire point of the tool.
 *
 *   empty vs anything                 -> differs / unspecified
 *     One side declared the dimension and said nothing; the other said something.
 *
 *   wildcard vs set|scalar            -> differs / specificity
 *     NOT equal. "this must be configured" and "this must equal X" are different
 *     assertions. Treating them as the same would hide the most interesting class of
 *     baseline disagreement - which framework is stricter - which is precisely what
 *     someone comparing baselines is trying to find out.
 *
 *   otherwise (all valued)            -> differs / value
 */
export function compareGroup(facets: readonly Facet[]): GroupResult {
  if (facets.length < 2) return { allEqual: true };

  const exps = facets.map((f) => f.exp);
  const first = exps[0];
  if (!first) return { allEqual: true };

  const allSame = exps.every((e) => e.kind === first.kind && e.key === first.key);
  if (allSame) return { allEqual: true };

  const kinds = new Set(exps.map((e) => e.kind));
  const hasPositive = kinds.has('set') || kinds.has('scalar') || kinds.has('wildcard');

  if (kinds.has('negated') && hasPositive) {
    return { allEqual: false, status: 'conflict', reason: 'polarity' };
  }
  if (kinds.has('empty')) {
    return { allEqual: false, status: 'differs', reason: 'unspecified' };
  }
  if (kinds.has('wildcard') && (kinds.has('set') || kinds.has('scalar'))) {
    return { allEqual: false, status: 'differs', reason: 'specificity' };
  }

  const notes = subsumptionNotes(exps);
  return {
    allEqual: false,
    status: 'differs',
    reason: 'value',
    ...(notes.length ? { notes } : {}),
  };
}

export interface ValueDiff {
  /** Raw values this column shares with every other column that has this facet. */
  readonly shared: readonly string[];
  /** Raw values unique to this column. These are the ones worth highlighting. */
  readonly unique: readonly string[];
}

/**
 * Per-value breakdown for a differing set.
 *
 * This is the payoff of the whole exercise: two policies each listing five application
 * GUIDs of which three match should highlight the two that differ, not light up the
 * entire node and leave the reader to diff twenty characters of GUID by eye.
 */
export function computeValueDiff(
  present: readonly (Facet | undefined)[],
): readonly (ValueDiff | undefined)[] {
  const valued = present.filter((f): f is Facet => !!f && isValued(f.exp));
  if (valued.length < 2) return present.map(() => undefined);

  let shared: Set<string> | undefined;
  for (const f of valued) {
    const s = lowerSet(valuesOf(f.exp));
    if (!shared) {
      shared = s;
    } else {
      for (const v of [...shared]) if (!s.has(v)) shared.delete(v);
    }
  }
  const sharedSet = shared ?? new Set<string>();

  return present.map((f) => {
    if (!f || !isValued(f.exp)) return undefined;
    const values = valuesOf(f.exp);
    return {
      shared: values.filter((v) => sharedSet.has(v.toLowerCase())),
      unique: values.filter((v) => !sharedSet.has(v.toLowerCase())),
    };
  });
}
