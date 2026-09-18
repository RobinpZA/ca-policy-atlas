/**
 * Extraction tests, driven by the genuinely awkward policies in the shipped corpus.
 *
 * These are not synthetic fixtures - every case below is a real policy whose shape
 * broke a naive reading of the schema during design.
 */

import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { extractFacets, toExpectation, canonicalSetKey } from '../src/domain/extractFacets.ts';
import { terminalOf } from '../src/domain/graph/terminal.ts';
import type { NormalizedPolicy } from '../src/domain/types.ts';

const get = (key: string): NormalizedPolicy => {
  const p = BASELINES.byKey.get(key);
  if (!p) throw new Error(`fixture missing: ${key}`);
  return p;
};

describe('corpus loads', () => {
  it('has all 94 policies across 4 baselines', () => {
    expect(BASELINES.policies).toHaveLength(94);
    expect(BASELINES.meta).toHaveLength(4);
  });

  it('synthesises a baselineKey for the Van Surksum file, which ships without one', () => {
    const vs = BASELINES.policies.filter((p) => p.baselineKey === 'VanSurksum');
    expect(vs).toHaveLength(49);
    expect(vs.every((p) => p.referenceUrl === undefined)).toBe(true);
  });

  it('reports no unknown-path anomalies anywhere - the taxonomy covers the corpus', () => {
    const unknown = BASELINES.policies.flatMap((p) =>
      p.anomalies.filter((a) => a.reason === 'unknown-path').map((a) => `${p.policyKey}:${a.path}`),
    );
    expect(unknown).toEqual([]);
  });
});

describe('toExpectation distinguishes the five shapes', () => {
  it('maps each JSON form to its own kind', () => {
    expect(toExpectation(true)?.kind).toBe('wildcard');
    expect(toExpectation(false)?.kind).toBe('negated');
    expect(toExpectation([])?.kind).toBe('empty');
    expect(toExpectation({})?.kind).toBe('empty');
    expect(toExpectation(['a'])?.kind).toBe('set');
    expect(toExpectation('never')?.kind).toBe('scalar');
    expect(toExpectation({ nested: true })).toBeUndefined();
  });

  it('canonical set keys ignore order, case and duplicates', () => {
    expect(canonicalSetKey(['high', 'medium'])).toBe(canonicalSetKey(['medium', 'high']));
    expect(canonicalSetKey(['All'])).toBe(canonicalSetKey(['all']));
    expect(canonicalSetKey(['a', 'a', 'b'])).toBe(canonicalSetKey(['b', 'a']));
  });

  it('absence produces no facet at all, which is how it stays distinct from empty', () => {
    const { facets } = extractFacets({ clientAppTypes: ['all'] });
    expect(facets.has('clientAppTypes')).toBe(true);
    expect(facets.has('users.includeUsers')).toBe(false);
  });
});

describe('CAD016 - token protection, 5 apps, platform filter', () => {
  const p = get('VanSurksum~CAD016');

  it('resolves all five application identifiers', () => {
    const apps = p.facets.get('applications.includeApplications');
    expect(apps?.display).toHaveLength(5);
    expect(apps?.display.map((d) => d.label)).toEqual([
      'Office 365 Exchange Online',
      'Office 365 SharePoint Online',
      'Windows 365',
      'Azure Virtual Desktop',
      'Windows Cloud Login',
    ]);
    expect(apps?.display.every((d) => d.resolved)).toBe(true);
  });

  it('treats tokenProtection as a wildcard, not the string "true"', () => {
    expect(p.facets.get('sessionControls.secureSignInSession.tokenProtection')?.exp.kind).toBe(
      'wildcard',
    );
  });

  it('scopes to Windows and asserts nothing about users', () => {
    expect(p.facets.get('platforms.includePlatforms')?.exp).toMatchObject({
      kind: 'set',
      values: ['windows'],
    });
    expect([...p.facets.keys()].some((k) => k.startsWith('users.'))).toBe(false);
  });
});

describe('CAU004 - the wildcard trap', () => {
  const p = get('VanSurksum~CAU004');

  it('reads includeApplications: true as a wildcard, NOT a set containing "true"', () => {
    const apps = p.facets.get('applications.includeApplications');
    expect(apps?.exp.kind).toBe('wildcard');
    expect(apps?.display).toEqual([]);
  });

  it('reads requireCompliant: false as negated, which is a claim, not an absence', () => {
    expect(p.facets.get('deviceState.requireCompliant')?.exp.kind).toBe('negated');
  });

  it('ends in session controls', () => {
    expect(terminalOf(p.facets).tone).toBe('session');
  });
});

describe('MT.1011 - user action, aliased locations, no outcome', () => {
  const p = get('Maester~MT.1011');

  it('carries a user action rather than an application', () => {
    expect(p.facets.get('applications.includeUserActions')?.display[0]?.label).toBe(
      'Register security info',
    );
    expect(p.facets.has('applications.includeApplications')).toBe(false);
  });

  it('canonicalises `locations: true` to includeLocations', () => {
    expect(p.facets.get('conditions.locations.includeLocations')?.exp.kind).toBe('wildcard');
  });

  it('asserts no control at all - it is an existence check', () => {
    expect(terminalOf(p.facets)).toMatchObject({ tone: 'none', title: 'No control asserted' });
  });
});

describe('CIS-5.2.2.4 - aliased signInFrequency, scalar mode, wildcard roles', () => {
  const p = get('CIS~CIS-5.2.2.4');

  it('canonicalises `signInFrequency: true` to .isEnabled', () => {
    expect(p.facets.get('sessionControls.signInFrequency.isEnabled')?.exp.kind).toBe('wildcard');
  });

  it('keeps persistentBrowser.mode as a scalar', () => {
    expect(p.facets.get('sessionControls.persistentBrowser.mode')?.exp).toMatchObject({
      kind: 'scalar',
      value: 'never',
    });
  });

  it('treats includeRoles: true as tenant-defined', () => {
    expect(p.facets.get('users.includeRoles')?.exp.kind).toBe('wildcard');
  });
});

describe('MS.AAD.2.1 - risk-based block', () => {
  const p = get('CISA~MS.AAD.2.1');

  it('carries a user risk condition and blocks', () => {
    expect(p.facets.get('conditions.userRiskLevels')?.exp).toMatchObject({
      kind: 'set',
      values: ['high'],
    });
    expect(terminalOf(p.facets).tone).toBe('block');
  });

  it('ignores weightOverrides, which belong to the auditor and not to us', () => {
    expect([...p.facets.keys()].some((k) => k.includes('weight'))).toBe(false);
  });
});

describe('CAD006 - grantControls declared but empty', () => {
  const p = get('VanSurksum~CAD006');

  it('records the empty container rather than dropping it', () => {
    expect(p.facets.get('grantControls')?.exp.kind).toBe('empty');
  });

  it('says so in the terminal', () => {
    expect(terminalOf(p.facets)).toMatchObject({
      tone: 'session',
      title: 'Session controls only',
    });
  });
});

describe('the three Maester policies with no stated intent', () => {
  it('leaves policyIntent undefined rather than inventing one', () => {
    for (const id of ['MT.1003', 'MT.1004', 'MT.1071']) {
      const p = get(`Maester~${id}`);
      expect(p.policyIntent).toBeUndefined();
      expect(terminalOf(p.facets).tone).toBe('none');
    }
  });
});

describe('unresolved application identifiers', () => {
  it('names the three apps it can and admits to the one it cannot', () => {
    const p = get('VanSurksum~CAD013');
    const apps = p.facets.get('applications.includeApplications');
    const resolved = apps?.display.filter((d) => d.resolved) ?? [];
    const unresolved = apps?.display.filter((d) => !d.resolved) ?? [];

    expect(resolved.map((d) => d.label).sort()).toEqual([
      'Azure DevOps',
      'Azure Service Management',
      'Dynamics 365 Business Central',
    ]);
    // a4f2693f-129c-4b96-982b-2c364b8314d7 is absent from merill/microsoft-info and
    // unnamed by the baseline itself. It must render as a GUID, never as a guess.
    expect(unresolved).toHaveLength(1);
    // Truncated, never invented, and the full value is retained for hover and copy.
    expect(unresolved.every((d) => d.label.endsWith('…'))).toBe(true);
    expect(unresolved.every((d) => d.raw.length === 36)).toBe(true);
  });
});
