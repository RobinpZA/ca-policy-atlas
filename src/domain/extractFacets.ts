/**
 * Canonical pattern object -> FacetMap.
 *
 * Both source adapters funnel through here, so baseline and tenant policies end up
 * structurally identical and can be compared without either side being special-cased.
 */

import { applyAliases } from './aliases.ts';
import { FACET_SPECS, SPEC_PATHS } from './facetSpecs.ts';
import { deepClone, getPath, isEmptyObject, isPlainObject, leafPaths } from './objectPath.ts';
import { resolveTokens } from './labels.ts';
import {
  EMPTY_KEY,
  NEGATED_KEY,
  SET_KEY_SEP,
  WILDCARD_KEY,
  type Anomaly,
  type Expectation,
  type Facet,
  type FacetMap,
  type RawObject,
  type RawValue,
} from './types.ts';

/**
 * Order-insensitive, case-insensitive, duplicate-insensitive key for a set.
 *
 * This is not hypothetical tidiness. The shipped corpus contains signInRiskLevels as
 * both ["high","medium"] and ["medium","high"], and applications as both "All" and
 * "all". Without this, those compare as different and the tool reports a difference
 * that does not exist.
 */
export const canonicalSetKey = (values: readonly string[]): string =>
  [...new Set(values.map((v) => v.toLowerCase()))].sort().join(SET_KEY_SEP);

const asString = (v: RawValue): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : String(v);

/**
 * Interpret one raw leaf.
 *
 * Returns `undefined` for a non-empty object: that is not a failure, it means a deeper
 * FacetSpec owns the contents. It also returns `undefined` for genuinely uninterpretable
 * values, which the caller records as an anomaly.
 */
export function toExpectation(raw: RawValue): Expectation | undefined {
  if (raw === true) return { kind: 'wildcard', key: WILDCARD_KEY };
  if (raw === false) return { kind: 'negated', key: NEGATED_KEY };
  if (raw === null) return undefined;

  if (Array.isArray(raw)) {
    if (raw.length === 0) return { kind: 'empty', key: EMPTY_KEY };
    const values = raw.map(asString);
    return { kind: 'set', values, key: canonicalSetKey(values) };
  }

  if (isPlainObject(raw)) {
    if (Object.keys(raw).length === 0) return { kind: 'empty', key: EMPTY_KEY };
    return undefined; // a deeper spec owns this branch
  }

  if (typeof raw === 'string') {
    if (raw.length === 0) return { kind: 'empty', key: EMPTY_KEY };
    return { kind: 'scalar', value: raw, key: raw.toLowerCase() };
  }

  if (typeof raw === 'number') {
    const s = String(raw);
    return { kind: 'scalar', value: s, key: s };
  }

  return undefined;
}

export interface ExtractResult {
  readonly facets: FacetMap;
  readonly anomalies: readonly Anomaly[];
}

export function extractFacets(pattern: RawObject): ExtractResult {
  const mp = applyAliases(deepClone(pattern) as RawObject);
  const facets = new Map<string, Facet>();
  const anomalies: Anomaly[] = [];

  for (const spec of FACET_SPECS) {
    const raw = getPath(mp, spec.path);

    // ABSENT. No entry, deliberately. This is what keeps absent distinct from both
    // `wildcard` (present, tenant-defined) and `empty` (present, unspecified).
    if (raw === undefined) continue;

    // The presence-only spec exists solely for `grantControls: {}`; it must not fire
    // for a populated container, which the per-leaf specs already cover.
    if (spec.presenceOnly && !isEmptyObject(raw)) continue;

    const exp = toExpectation(raw);
    if (!exp) {
      // A non-empty object here is normal - a deeper spec handles it. Anything else is
      // a shape we do not understand and must not quietly ignore.
      if (!isPlainObject(raw)) {
        anomalies.push({
          path: spec.path,
          reason: 'unhandled-shape',
          detail: JSON.stringify(raw),
        });
      }
      continue;
    }

    const display = resolveTokens(exp, spec.tokenKind);
    for (const token of display) {
      if (!token.resolved) {
        anomalies.push({ path: spec.path, reason: 'unresolved-token', detail: token.raw });
      }
    }

    facets.set(spec.path, { ...spec, exp, display });
  }

  // THE GUARD. Any leaf present in the source that no spec claims is a dimension this
  // build cannot see. Without this, refreshing a baseline file with a new condition
  // would silently drop it and every comparison would quietly be wrong. Tenant input
  // gets a second census over its raw Graph shape - see rawCensus in fromGraph.ts.
  for (const leaf of leafPaths(mp)) {
    if (SPEC_PATHS.has(leaf)) continue;
    anomalies.push({ path: leaf, reason: 'unknown-path' });
  }

  return { facets, anomalies };
}
