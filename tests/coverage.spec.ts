/**
 * Coverage scoring. Each rule in coverage.ts's header has a test here, so changing a
 * judgement means deliberately changing a test.
 */

import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { extractFacets } from '../src/domain/extractFacets.ts';
import { coverageOf, coverageReport, requirementsOf } from '../src/domain/diff/coverage.ts';
import type { NormalizedPolicy, PolicyState, RawObject } from '../src/domain/types.ts';

const baseline = (id: string, pattern: RawObject): NormalizedPolicy => ({
  source: 'baseline',
  policyKey: `Test~${id}`,
  baselineKey: 'Test',
  id,
  name: id,
  ...extractFacets(pattern),
});

let n = 0;
const tenant = (pattern: RawObject, state: PolicyState = 'enabled'): NormalizedPolicy => ({
  source: 'tenant',
  policyKey: `tenant~${n++}`,
  id: `t${n}`,
  name: `t${n}`,
  state,
  ...extractFacets(pattern),
});

const LEGACY_BLOCK: RawObject = {
  applications: { includeApplications: ['All'] },
  users: { includeUsers: true },
  clientAppTypes: ['exchangeActiveSync', 'other'],
  grantControls: { builtInControls: ['block'] },
};

describe('coverageOf', () => {
  it('calls an identical tenant policy covered', () => {
    const b = baseline('b', LEGACY_BLOCK);
    const t = tenant({ ...LEGACY_BLOCK, users: { includeUsers: ['All'] } });
    const c = coverageOf(b, [t]);
    expect(c.status).toBe('covered');
    expect(c.best?.met).toHaveLength(c.required);
  });

  it('lets a concrete tenant value meet a baseline wildcard', () => {
    const b = baseline('b', { conditions: { locations: { includeLocations: true } } });
    const c = coverageOf(b, [tenant({ conditions: { locations: { includeLocations: ['All'] } } })]);
    expect(c.status).toBe('covered');
  });

  it('lets scope match on its own when scope is all a baseline asserts', () => {
    // Maester's existence checks: "a policy covering this scope must exist".
    const b = baseline('b', { users: { includeUsers: true } });
    const c = coverageOf(b, [tenant({ users: { includeUsers: ['All'] } })]);
    expect(c.status).toBe('covered');
  });

  it('does NOT let a broader tenant value meet a narrower baseline one', () => {
    const b = baseline('b', {
      applications: { includeApplications: ['Office365'] },
      grantControls: { builtInControls: ['mfa'] },
    });
    const c = coverageOf(b, [
      tenant({
        applications: { includeApplications: ['All'] },
        grantControls: { builtInControls: ['mfa'] },
      }),
    ]);
    expect(c.status).toBe('partial');
    expect(c.best?.unmet).toEqual(['applications.includeApplications']);
  });

  it('reports opposite polarity as a conflict, not just unmet', () => {
    const b = baseline('b', {
      deviceState: { requireCompliant: true },
      grantControls: { builtInControls: ['block'] },
    });
    const c = coverageOf(b, [
      tenant({
        deviceState: { requireCompliant: false },
        grantControls: { builtInControls: ['block'] },
      }),
    ]);
    expect(c.best?.conflict).toEqual(['deviceState.requireCompliant']);
    expect(c.status).toBe('partial');
  });

  it('is uncovered when no tenant policy meets a single requirement', () => {
    const b = baseline('b', LEGACY_BLOCK);
    const c = coverageOf(b, [tenant({ conditions: { signInRiskLevels: ['high'] } })]);
    expect(c.status).toBe('uncovered');
    expect(c.best).toBeUndefined();
  });

  it('does not treat shared scope alone as a match', () => {
    // The case the UI surfaced: same apps and users, entirely different job.
    const b = baseline('b', LEGACY_BLOCK);
    const t = tenant({
      applications: { includeApplications: ['All'] },
      users: { includeUsers: ['All'] },
      conditions: { userRiskLevels: ['high'] },
      grantControls: { builtInControls: ['passwordChange'] },
    });
    expect(coverageOf(b, [t]).status).toBe('uncovered');
  });

  it('does not treat a shared condition as a match when the controls differ', () => {
    // Graph puts clientAppTypes ["all"] on nearly every policy.
    const b = baseline('b', {
      clientAppTypes: ['all'],
      conditions: { authenticationFlows: { transferMethods: ['deviceCodeFlow'] } },
      grantControls: { builtInControls: ['block'] },
    });
    const t = tenant({ clientAppTypes: ['all'], grantControls: { builtInControls: ['mfa'] } });
    expect(coverageOf(b, [t]).status).toBe('uncovered');
  });

  it('does not let a shared grant operator stand in for a shared control', () => {
    const b = baseline('b', {
      grantControls: { builtInControls: ['compliantDevice'], operator: 'OR' },
    });
    const t = tenant({ grantControls: { builtInControls: ['mfa'], operator: 'OR' } });
    expect(coverageOf(b, [t]).status).toBe('uncovered');
  });

  it('does not count an empty baseline declaration as a requirement', () => {
    const b = baseline('b', { grantControls: {}, sessionControls: { signInFrequency: true } });
    expect(requirementsOf(b)).toEqual(['sessionControls.signInFrequency.isEnabled']);
  });

  it('prefers an enforced policy over a report-only one that meets as much', () => {
    const b = baseline('b', LEGACY_BLOCK);
    const reportOnly = tenant(LEGACY_BLOCK, 'reportOnly');
    const enabled = tenant(LEGACY_BLOCK, 'enabled');
    expect(coverageOf(b, [reportOnly, enabled]).best?.tenant).toBe(enabled);
  });

  it('picks the policy that meets the most requirements', () => {
    const b = baseline('b', LEGACY_BLOCK);
    const weak = tenant({ applications: { includeApplications: ['All'] } });
    const strong = tenant({ ...LEGACY_BLOCK, users: { includeUsers: ['All'] } });
    expect(coverageOf(b, [weak, strong]).best?.tenant).toBe(strong);
  });
});

describe('coverageReport over a real baseline', () => {
  it('scores every policy exactly once', () => {
    const cis = BASELINES.policies.filter((p) => p.baselineKey === 'CIS');
    const report = coverageReport(cis, [tenant(LEGACY_BLOCK)]);
    expect(report.rows).toHaveLength(cis.length);
    const { covered, partial, uncovered } = report.counts;
    expect(covered + partial + uncovered).toBe(cis.length);
  });

  it('with nothing loaded, covers nothing', () => {
    const cis = BASELINES.policies.filter((p) => p.baselineKey === 'CIS');
    expect(coverageReport(cis, []).counts.uncovered).toBe(cis.length);
  });
});
