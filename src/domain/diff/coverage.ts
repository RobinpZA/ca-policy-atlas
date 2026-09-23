/**
 * Baseline coverage: for each policy in a baseline, which loaded tenant policy comes
 * closest to asserting the same thing, and what it leaves unmet.
 *
 * This is the one place the app scores rather than just compares, so the rules are few,
 * strict and written down here to be argued with:
 *
 *   - Only dimensions the BASELINE asserts count. A tenant policy saying more (extra
 *     exclusions, extra conditions) is not penalised here; the comparison view shows it.
 *   - `empty` in the baseline asserts nothing, so it is not a requirement.
 *   - MET when the tenant states the identical thing, or when the baseline says "configure
 *     this, the value is yours" (wildcard) and the tenant has a concrete value - the
 *     specificity case fromGraph.ts already calls reading exactly right.
 *   - Anything else is UNMET, including a tenant value that is broader. `All` does not
 *     silently cover `Office365` here for the same reason it does not in the diff: that is
 *     a judgement for the reader, and the unmet list plus the compare link hands it to them.
 *   - Opposite polarity is reported separately as a CONFLICT, because "you have not done
 *     this" and "you have done the opposite" are different findings.
 *   - A tenant policy is only a CANDIDATE if it does the same JOB: it must meet at least
 *     one of the baseline's controls (grant or session). Found by running Microsoft's
 *     Graph examples through the UI - matching on scope called "require password change
 *     for risky users" a partial match for "block legacy authentication", and matching on
 *     conditions did no better, because Graph puts `clientAppTypes: ["all"]` on nearly
 *     every policy. A baseline with no controls falls back to its conditions, and one with
 *     only scope (Maester's existence checks) to its scope - there, that IS the ask.
 */

import { FACET_SPECS, FACET_SPEC_BY_PATH } from '../facetSpecs.ts';
import type { NodeKey } from '../types.ts';
import { expEquals, isValued, type Facet, type NormalizedPolicy } from '../types.ts';
import { compareGroup } from './compare.ts';

export type FacetMatch = 'met' | 'unmet' | 'conflict';

export function matchFacet(baseline: Facet, tenant: Facet | undefined): FacetMatch {
  if (!tenant) return 'unmet';
  if (expEquals(baseline.exp, tenant.exp)) return 'met';
  if (baseline.exp.kind === 'wildcard' && isValued(tenant.exp)) return 'met';
  return compareGroup([baseline, tenant]).status === 'conflict' ? 'conflict' : 'unmet';
}

/** The facet paths a baseline policy actually requires, in taxonomy order. */
export const requirementsOf = (baseline: NormalizedPolicy): readonly string[] =>
  FACET_SPECS.filter((s) => {
    const f = baseline.facets.get(s.path);
    return !!f && f.exp.kind !== 'empty';
  }).map((s) => s.path);

export interface TenantMatch {
  readonly tenant: NormalizedPolicy;
  readonly met: readonly string[];
  readonly unmet: readonly string[];
  readonly conflict: readonly string[];
}

export type CoverageStatus = 'covered' | 'partial' | 'uncovered';

export interface PolicyCoverage {
  readonly baseline: NormalizedPolicy;
  readonly required: number;
  /** Absent when no tenant policy does the same job (see CANDIDATE above). */
  readonly best?: TenantMatch;
  readonly status: CoverageStatus;
}

export function matchTenant(baseline: NormalizedPolicy, tenant: NormalizedPolicy): TenantMatch {
  const met: string[] = [];
  const unmet: string[] = [];
  const conflict: string[] = [];
  for (const path of requirementsOf(baseline)) {
    const m = matchFacet(baseline.facets.get(path)!, tenant.facets.get(path));
    (m === 'met' ? met : m === 'conflict' ? conflict : unmet).push(path);
  }
  return { tenant, met, unmet, conflict };
}

/** Enabled beats report-only beats disabled: a policy that is not enforced covers less. */
const STATE_RANK = { enabled: 0, reportOnly: 1, disabled: 2 } as const;

const better = (a: TenantMatch, b: TenantMatch): boolean =>
  a.met.length !== b.met.length
    ? a.met.length > b.met.length
    : a.conflict.length !== b.conflict.length
      ? a.conflict.length < b.conflict.length
      : STATE_RANK[a.tenant.state ?? 'enabled'] < STATE_RANK[b.tenant.state ?? 'enabled'];

/** What a policy does. */
const CONTROLS: ReadonlySet<NodeKey> = new Set<NodeKey>(['ctrl.grant', 'ctrl.session']);
/** Who and what it targets. */
const SCOPE: ReadonlySet<NodeKey> = new Set<NodeKey>(['scope.apps', 'scope.users']);

/**
 * How controls combine, not a control. Two policies agreeing on "OR" while requiring
 * different things is not a shared job - it matched "require MFA" to "require a
 * compliant device" in the UI before it was split out.
 */
const MODIFIERS: ReadonlySet<string> = new Set(['grantControls.operator']);

type Tier = 'control' | 'condition' | 'scope' | 'modifier';

const tierOf = (path: string): Tier => {
  if (MODIFIERS.has(path)) return 'modifier';
  const node = FACET_SPEC_BY_PATH.get(path)?.node;
  if (node && CONTROLS.has(node)) return 'control';
  if (node && SCOPE.has(node)) return 'scope';
  return 'condition';
};

export function coverageOf(
  baseline: NormalizedPolicy,
  tenants: readonly NormalizedPolicy[],
): PolicyCoverage {
  const requirements = requirementsOf(baseline);
  const required = requirements.length;
  // The most specific tier the baseline asserts is the one a candidate has to meet.
  const tiers = new Set(requirements.map(tierOf));
  const gate: Tier = tiers.has('control')
    ? 'control'
    : tiers.has('condition')
      ? 'condition'
      : 'scope';
  const isCandidate = (m: TenantMatch): boolean => m.met.some((path) => tierOf(path) === gate);

  let best: TenantMatch | undefined;
  for (const tenant of tenants) {
    const m = matchTenant(baseline, tenant);
    if (isCandidate(m) && (!best || better(m, best))) best = m;
  }

  const status: CoverageStatus = !best
    ? 'uncovered'
    : best.met.length === required
      ? 'covered'
      : 'partial';

  return { baseline, required, ...(best ? { best } : {}), status };
}

export interface CoverageReport {
  readonly rows: readonly PolicyCoverage[];
  readonly counts: Readonly<Record<CoverageStatus, number>>;
}

export function coverageReport(
  baselines: readonly NormalizedPolicy[],
  tenants: readonly NormalizedPolicy[],
): CoverageReport {
  const rows = baselines.map((b) => coverageOf(b, tenants));
  const counts = { covered: 0, partial: 0, uncovered: 0 };
  for (const r of rows) counts[r.status]++;
  return { rows, counts };
}
