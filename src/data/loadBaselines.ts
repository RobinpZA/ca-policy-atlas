/**
 * Build-time load of the four baseline files.
 *
 * Static imports rather than fetch: this is versioned reference data that changes
 * quarterly, so there is no loading state to design, no base-path surprises on GitHub
 * Pages, and no CORS. The cost - a rebuild to pick up new baselines - is the right
 * trade for data that lives in the repo anyway.
 */

import appConfig from '../../config/app.config.json';
import cisRaw from './baselines/cis-m365-foundations.json';
import cisaRaw from './baselines/cisa-scuba-aad.json';
import maesterRaw from './baselines/maester-mt.json';
import vanSurksumRaw from './baselines/vansurksum-202510.json';

import {
  normalizeBaselinePolicy,
  type RawBaselineFile,
  type RawBaselinePolicy,
} from '../domain/adapters/fromBaseline.ts';
import type { NormalizedPolicy, PolicyKey } from '../domain/types.ts';

export interface BaselineRegistryEntry {
  readonly file: string;
  readonly key: string;
  readonly label: string;
  readonly short: string;
}

export const BASELINE_REGISTRY: readonly BaselineRegistryEntry[] = appConfig.baselines;
export const MAX_COLUMNS: number = appConfig.maxColumns;

const FILES: Record<string, unknown> = {
  'vansurksum-202510.json': vanSurksumRaw,
  'maester-mt.json': maesterRaw,
  'cis-m365-foundations.json': cisRaw,
  'cisa-scuba-aad.json': cisaRaw,
};

export interface BaselineMeta extends BaselineRegistryEntry {
  readonly version: string;
  readonly source: string;
  readonly url: string;
  readonly description?: string;
  readonly policyCount: number;
}

export interface BaselineData {
  readonly policies: readonly NormalizedPolicy[];
  readonly byKey: ReadonlyMap<PolicyKey, NormalizedPolicy>;
  readonly meta: readonly BaselineMeta[];
}

function buildBaselines(): BaselineData {
  const policies: NormalizedPolicy[] = [];
  const meta: BaselineMeta[] = [];
  const seen = new Set<PolicyKey>();

  for (const entry of BASELINE_REGISTRY) {
    const mod = FILES[entry.file];
    if (!mod) throw new Error(`Baseline file not bundled: ${entry.file}`);
    const file = mod as RawBaselineFile;

    // A file that declares its own key and disagrees with the registry has been swapped.
    // Fail loudly rather than silently trusting one of the two.
    if (file.baselineKey && file.baselineKey !== entry.key) {
      throw new Error(
        `Baseline key mismatch in ${entry.file}: file says "${file.baselineKey}", ` +
          `registry says "${entry.key}". Update config/app.config.json or fix the file.`,
      );
    }

    if (typeof file.totalPolicies === 'number' && file.totalPolicies !== file.policies.length) {
      throw new Error(
        `${entry.file}: totalPolicies is ${file.totalPolicies} but the array holds ` +
          `${file.policies.length}. The file is inconsistent with itself.`,
      );
    }

    for (const raw of file.policies as RawBaselinePolicy[]) {
      const policy = normalizeBaselinePolicy(raw, entry.key);
      if (seen.has(policy.policyKey)) {
        throw new Error(`Duplicate policy key ${policy.policyKey} in ${entry.file}`);
      }
      seen.add(policy.policyKey);
      policies.push(policy);
    }

    meta.push({
      ...entry,
      version: file.version,
      source: file.source,
      url: file.url,
      ...(file.description ? { description: file.description } : {}),
      policyCount: file.policies.length,
    });
  }

  return {
    policies,
    byKey: new Map(policies.map((p) => [p.policyKey, p])),
    meta,
  };
}

/** Computed once at module init. 94 policies x ~20 facets is single-digit milliseconds. */
export const BASELINES: BaselineData = buildBaselines();
