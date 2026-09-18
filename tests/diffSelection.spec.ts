/**
 * Diff semantics.
 *
 * Several of these encode a judgement call rather than an obvious truth - notably
 * wildcard-vs-set and the `Office365` vs `All` case. They are written out explicitly so
 * that changing the judgement means deliberately changing a test, not silently changing
 * behaviour.
 */

import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { extractFacets } from '../src/domain/extractFacets.ts';
import { diffSelection } from '../src/domain/diff/diffSelection.ts';
import { compareGroup } from '../src/domain/diff/compare.ts';
import type { Facet, FacetMap, NormalizedPolicy, RawObject } from '../src/domain/types.ts';

/** Build a throwaway policy from a raw matchPatterns object. */
const synth = (id: string, matchPatterns: RawObject): NormalizedPolicy => {
  const { facets, anomalies } = extractFacets(matchPatterns);
  return {
    source: 'baseline',
    policyKey: `Test~${id}`,
    id,
    name: id,
    baselineKey: 'Test',
    facets,
    anomalies,
  };
};

const facetAt = (map: FacetMap, path: string): Facet => {
  const f = map.get(path);
  if (!f) throw new Error(`no facet at ${path}`);
  return f;
};

const statusAt = (policies: NormalizedPolicy[], path: string): string[] => {
  const d = diffSelection(policies);
  const entry = d.byPath.get(path);
  if (!entry) throw new Error(`no diff entry for ${path}`);
  return [...entry.status];
};

describe('set comparison is order, case and duplicate insensitive', () => {
  it('["high","medium"] equals ["medium","high"] - both orderings ship in the corpus', () => {
    const a = synth('a', { conditions: { signInRiskLevels: ['high', 'medium'] } });
    const b = synth('b', { conditions: { signInRiskLevels: ['medium', 'high'] } });
    expect(statusAt([a, b], 'conditions.signInRiskLevels')).toEqual(['same', 'same']);
  });

  it('"All" equals "all"', () => {
    const a = synth('a', { applications: { includeApplications: ['All'] } });
    const b = synth('b', { applications: { includeApplications: ['all'] } });
    expect(statusAt([a, b], 'applications.includeApplications')).toEqual(['same', 'same']);
  });

  it('preserves original casing for display even though it folds for comparison', () => {
    const a = synth('a', { applications: { includeApplications: ['All'] } });
    expect(facetAt(a.facets, 'applications.includeApplications').display[0]?.raw).toBe('All');
  });
});

describe('the judgement calls', () => {
  it('wildcard vs concrete is a difference in SPECIFICITY, not a match', () => {
    const a = synth('a', { users: { includeRoles: true } });
    const b = synth('b', { users: { includeRoles: ['Global Administrator'] } });
    const d = diffSelection([a, b]);
    expect(d.byPath.get('users.includeRoles')?.status).toEqual(['differs', 'differs']);
    expect(d.byPath.get('users.includeRoles')?.reason).toBe('specificity');
  });

  it('wildcard vs wildcard is the same assertion', () => {
    const a = synth('a', { users: { includeRoles: true } });
    const b = synth('b', { users: { includeRoles: true } });
    expect(statusAt([a, b], 'users.includeRoles')).toEqual(['same', 'same']);
  });

  it('negated vs positive is a CONFLICT - opposite polarity, not merely different', () => {
    const a = synth('a', { deviceState: { requireCompliant: false } });
    const b = synth('b', { deviceState: { requireCompliant: true } });
    const d = diffSelection([a, b]);
    expect(d.byPath.get('deviceState.requireCompliant')?.status).toEqual(['conflict', 'conflict']);
    expect(d.byPath.get('deviceState.requireCompliant')?.reason).toBe('polarity');
  });

  it('an empty list vs a real value differs as UNSPECIFIED', () => {
    const a = synth('a', { conditions: { locations: { excludeLocations: [] } } });
    const b = synth('b', { conditions: { locations: { excludeLocations: ['AllTrusted'] } } });
    const d = diffSelection([a, b]);
    expect(d.byPath.get('conditions.locations.excludeLocations')?.reason).toBe('unspecified');
  });

  it('CAD006-style empty grantControls reads as unique on BOTH sides, which is correct', () => {
    // `grantControls: {}` produces a facet at path `grantControls`, whereas a populated
    // container produces facets at `grantControls.*` and none at `grantControls`. So the
    // two policies genuinely assert different things at different paths, and each column
    // has something the other lacks. Both sides flag their Grant node at high severity
    // and the terminal states the actual difference - which is the honest reading.
    const a = synth('a', { grantControls: {} });
    const b = synth('b', { grantControls: { builtInControls: ['mfa'] } });
    const d = diffSelection([a, b]);

    expect(d.byPath.get('grantControls')?.status).toEqual(['only', 'missing']);
    expect(d.byPath.get('grantControls.builtInControls')?.status).toEqual(['missing', 'only']);
    expect(d.nodeStatus[0]?.get('ctrl.grant')).toBe('only');
    expect(d.nodeStatus[1]?.get('ctrl.grant')).toBe('only');
  });

  it('Office365 vs All stays a difference, but carries an explanatory note', () => {
    const a = synth('a', { applications: { includeApplications: ['Office365'] } });
    const b = synth('b', { applications: { includeApplications: ['All'] } });
    const d = diffSelection([a, b]);
    const entry = d.byPath.get('applications.includeApplications');
    expect(entry?.status).toEqual(['differs', 'differs']);
    expect(entry?.notes?.[0]).toMatch(/includes the Office 365 suite/);
  });
});

describe('presence and coverage', () => {
  it('a facet only one column has is "only" there and "missing" elsewhere', () => {
    const a = synth('a', { clientAppTypes: ['all'], platforms: { includePlatforms: ['windows'] } });
    const b = synth('b', { clientAppTypes: ['all'] });
    expect(statusAt([a, b], 'platforms.includePlatforms')).toEqual(['only', 'missing']);
  });

  it('equal among 3 of 5 columns is differs/coverage, not same', () => {
    const withIt = () => synth('w', { conditions: { userRiskLevels: ['high'] } });
    const without = () => synth('x', { clientAppTypes: ['all'] });
    const sel = [withIt(), withIt(), withIt(), without(), without()];
    expect(statusAt(sel, 'conditions.userRiskLevels')).toEqual([
      'differs/coverage',
      'differs/coverage',
      'differs/coverage',
      'missing',
      'missing',
    ]);
  });

  it('present in every column and equal is same', () => {
    const p = () => synth('p', { conditions: { userRiskLevels: ['high'] } });
    expect(statusAt([p(), p(), p()], 'conditions.userRiskLevels')).toEqual([
      'same',
      'same',
      'same',
    ]);
  });

  it('a single selection compares against nothing', () => {
    const d = diffSelection([synth('a', { clientAppTypes: ['all'] })]);
    expect(d.mode).toBe('single');
    expect(d.byPath.get('clientAppTypes')?.status).toEqual(['single']);
  });

  it('an empty selection is handled without throwing', () => {
    const d = diffSelection([]);
    expect(d.paths).toEqual([]);
    expect(d.rankPlan).toEqual([]);
  });
});

describe('per-value diff', () => {
  it('separates shared application ids from the ones that actually differ', () => {
    const a = synth('a', { applications: { includeApplications: ['X', 'Y', 'Z'] } });
    const b = synth('b', { applications: { includeApplications: ['X', 'Y', 'Q'] } });
    const d = diffSelection([a, b]);
    const vd = d.byPath.get('applications.includeApplications')?.valueDiff;
    expect(vd?.[0]).toEqual({ shared: ['X', 'Y'], unique: ['Z'] });
    expect(vd?.[1]).toEqual({ shared: ['X', 'Y'], unique: ['Q'] });
  });
});

describe('structural guarantees', () => {
  it('is symmetric - reversing the selection permutes the statuses, nothing more', () => {
    const a = synth('a', { clientAppTypes: ['browser'], users: { includeUsers: ['All'] } });
    const b = synth('b', { clientAppTypes: ['all'] });

    const fwd = diffSelection([a, b]);
    const rev = diffSelection([b, a]);

    expect([...fwd.byPath.keys()].sort()).toEqual([...rev.byPath.keys()].sort());
    for (const [path, entry] of fwd.byPath) {
      expect(rev.byPath.get(path)?.status).toEqual([...entry.status].reverse());
    }
  });

  it('every column renders the same ranks, so rows line up across the board', () => {
    const a = BASELINES.byKey.get('VanSurksum~CAD016')!;
    const b = BASELINES.byKey.get('CIS~CIS-5.2.2.4')!;
    const c = BASELINES.byKey.get('Maester~MT.1011')!;
    const d = diffSelection([a, b, c]);

    expect(d.nodeStatus).toHaveLength(3);
    for (const map of d.nodeStatus) {
      expect([...map.keys()].sort()).toEqual([...d.rankPlan].sort());
    }
  });

  it('node status takes the most severe of its facets', () => {
    // scope.users holds a conflicting facet and an identical one; conflict must win.
    const a = synth('a', { users: { includeUsers: ['All'], includeRoles: true } });
    const b = synth('b', { users: { includeUsers: ['All'], includeRoles: ['Admin'] } });
    const d = diffSelection([a, b]);
    expect(d.nodeStatus[0]?.get('scope.users')).toBe('differs');
  });

  it('keeps the rank plan in taxonomy order, never selection order', () => {
    const a = BASELINES.byKey.get('CISA~MS.AAD.2.1')!;
    const b = BASELINES.byKey.get('VanSurksum~CAD016')!;
    const ranks = diffSelection([a, b]).rankPlan;
    expect(ranks[0]).toBe('policy.head');
    expect(ranks[ranks.length - 1]).toBe('end.terminal');
  });
});

describe('compareGroup directly', () => {
  it('treats a lone facet as equal - there is nothing to disagree with', () => {
    const a = synth('a', { clientAppTypes: ['all'] });
    expect(compareGroup([facetAt(a.facets, 'clientAppTypes')]).allEqual).toBe(true);
  });
});

describe('real corpus comparison', () => {
  it('CIS and Van Surksum sign-in frequency agree despite different encodings', () => {
    // CIS writes `signInFrequency: true`; at least one Van Surksum policy writes the
    // long form. Without the alias table these would read as a false difference.
    const cis = BASELINES.byKey.get('CIS~CIS-5.2.2.4')!;
    const others = BASELINES.policies.filter(
      (p) =>
        p.policyKey !== cis.policyKey &&
        p.facets.get('sessionControls.signInFrequency.isEnabled')?.exp.kind === 'wildcard',
    );
    expect(others.length).toBeGreaterThan(0);

    const d = diffSelection([cis, others[0]!]);
    expect(d.byPath.get('sessionControls.signInFrequency.isEnabled')?.status).toEqual([
      'same',
      'same',
    ]);
  });

  it('the two excludeLocations wildcards differ in specificity from the AllTrusted ones', () => {
    const wildcard = BASELINES.policies.filter(
      (p) => p.facets.get('conditions.locations.excludeLocations')?.exp.kind === 'wildcard',
    );
    const concrete = BASELINES.policies.filter(
      (p) => p.facets.get('conditions.locations.excludeLocations')?.exp.kind === 'set',
    );
    expect(wildcard.length).toBe(2);
    expect(concrete.length).toBe(2);

    const d = diffSelection([wildcard[0]!, concrete[0]!]);
    expect(d.byPath.get('conditions.locations.excludeLocations')?.reason).toBe('specificity');
  });
});
