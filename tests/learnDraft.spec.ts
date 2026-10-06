import { describe, expect, it } from 'vitest';
import { FACET_SPEC_BY_PATH } from '../src/domain/facetSpecs.ts';
import {
  BUILDER_SPECS,
  EMPTY_DRAFT,
  accepts,
  draftProblems,
  draftToGraph,
  draftToPolicy,
  paletteFor,
  place,
  removeValue,
  type Draft,
} from '../src/domain/learn/draft.ts';
import { ANATOMY } from '../src/domain/learn/anatomy.ts';

const spec = (path: string) => FACET_SPEC_BY_PATH.get(path)!;

const withSlots = (slots: Draft['slots']): Draft => ({ ...EMPTY_DRAFT, slots });

describe('builder specs', () => {
  it('every builder slot has palette values and an anatomy entry', () => {
    expect(BUILDER_SPECS.length).toBeGreaterThan(10);
    for (const s of BUILDER_SPECS) {
      expect(paletteFor(s).length, s.path).toBeGreaterThan(0);
      expect(ANATOMY[s.node], s.path).toBeDefined();
    }
  });

  it('never offers Graph enum placeholders', () => {
    for (const s of BUILDER_SPECS) {
      expect(paletteFor(s).map((v) => v.toLowerCase())).not.toContain('unknownfuturevalue');
    }
  });

  it('keeps user keywords out of group slots', () => {
    expect(accepts(spec('users.includeUsers'), 'All')).toBe(true);
    expect(accepts(spec('users.includeGroups'), 'All')).toBe(false);
    expect(accepts(spec('users.includeGroups'), 'Pilot group (example)')).toBe(true);
  });
});

describe('draft round trip through the Graph adapter', () => {
  it('produces the expected facets with no anomalies', () => {
    const draft = withSlots({
      'users.includeUsers': ['All'],
      'users.excludeUsers': ['Break-glass accounts (example)'],
      'applications.includeApplications': ['Office365'],
      clientAppTypes: ['browser', 'mobileappsanddesktopclients'],
      'conditions.locations.includeLocations': ['all'],
      'conditions.locations.excludeLocations': ['alltrusted'],
      'grantControls.builtInControls': ['mfa', 'compliantdevice'],
      'grantControls.operator': ['or'],
      'sessionControls.signInFrequency.interval': ['4 hours'],
      'sessionControls.persistentBrowser.mode': ['never'],
    });
    const p = draftToPolicy(draft, 0);

    expect(p.anomalies.filter((a) => a.reason !== 'unresolved-token')).toEqual([]);
    expect(p.state).toBe('reportOnly');
    expect(p.facets.get('users.excludeUsers')?.exp).toMatchObject({
      kind: 'set',
      values: ['Break-glass accounts (example)'],
    });
    expect(p.facets.get('grantControls.operator')?.exp).toMatchObject({ kind: 'scalar', value: 'or' });
    expect(p.facets.get('sessionControls.signInFrequency.interval')?.exp).toMatchObject({
      kind: 'scalar',
      value: '4 hours',
    });
    expect(p.facets.get('sessionControls.persistentBrowser.mode')?.exp).toMatchObject({
      kind: 'scalar',
      value: 'never',
    });
  });

  it('round-trips every interval it offers', () => {
    const s = spec('sessionControls.signInFrequency.interval');
    for (const v of paletteFor(s)) {
      const p = draftToPolicy(withSlots({ [s.path]: [v] }), 0);
      expect(p.facets.get(s.path)?.exp, v).toMatchObject({ kind: 'scalar', value: v });
    }
  });

  it('an empty slot is absent - never an empty list', () => {
    let d = place(EMPTY_DRAFT, spec('platforms.includePlatforms'), 'all');
    d = removeValue(d, 'platforms.includePlatforms', 'all');
    expect(d.slots).toEqual({});
    const graph = draftToGraph(d);
    expect(graph['conditions']).toBeUndefined();
    expect(draftToPolicy(d, 0).facets.has('platforms.includePlatforms')).toBe(false);
  });

  it('single-value slots replace, list slots ignore duplicates', () => {
    let d = place(EMPTY_DRAFT, spec('grantControls.operator'), 'or');
    d = place(d, spec('grantControls.operator'), 'and');
    expect(d.slots['grantControls.operator']).toEqual(['and']);

    d = place(d, spec('clientAppTypes'), 'browser');
    d = place(d, spec('clientAppTypes'), 'Browser');
    expect(d.slots['clientAppTypes']).toEqual(['browser']);
  });

  it('rejects a value the slot does not take', () => {
    const d = place(EMPTY_DRAFT, spec('platforms.includePlatforms'), 'mfa');
    expect(d).toBe(EMPTY_DRAFT);
  });
});

describe('draftProblems', () => {
  it('an empty draft lists scope and control problems', () => {
    expect(draftProblems(EMPTY_DRAFT)).toHaveLength(3);
  });

  it('a minimal valid policy has none', () => {
    const d = withSlots({
      'users.includeUsers': ['All'],
      'applications.includeApplications': ['All'],
      'grantControls.builtInControls': ['mfa'],
    });
    expect(draftProblems(d)).toEqual([]);
  });

  it('flags block mixed with other controls, missing operator, and exclude-only conditions', () => {
    const d = withSlots({
      'users.includeUsers': ['All'],
      'applications.includeApplications': ['All'],
      'grantControls.builtInControls': ['block', 'mfa'],
      'platforms.excludePlatforms': ['ios'],
      'conditions.locations.excludeLocations': ['alltrusted'],
    });
    const problems = draftProblems(d).join('\n');
    expect(problems).toMatch(/Block cannot be combined/);
    expect(problems).toMatch(/operator/);
    expect(problems).toMatch(/Include platforms/);
    expect(problems).toMatch(/Include locations/);
  });
});
