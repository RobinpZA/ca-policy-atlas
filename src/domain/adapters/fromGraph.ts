/**
 * Real Microsoft Graph `conditionalAccessPolicy` -> NormalizedPolicy.
 *
 * Reshapes the Graph schema onto the same canonical paths the baselines use, so a
 * tenant policy and a curated baseline are structurally identical by the time anything
 * downstream sees them. That is the whole reason this feature is cheap rather than a
 * second application.
 *
 * Worth knowing when reading a comparison: baseline values are frequently `true`
 * (wildcard - "configure this, the value is yours"), while tenant values are always
 * concrete. So baseline-vs-tenant naturally lands on `differs/specificity`, which reads
 * exactly right: "the baseline wants this configured; yours is configured thus."
 */

import { extractFacets } from '../extractFacets.ts';
import { isPlainObject, setPath } from '../objectPath.ts';
import type { Anomaly, NormalizedPolicy, PolicyState, RawObject, RawValue } from '../types.ts';

/**
 * Raw Graph paths that are real but carry no comparable design intent. Checked against
 * the SOURCE object by `rawCensus` - the canonical object never contains them.
 */
const IGNORED: ReadonlySet<string> = new Set([
  'id',
  'displayName',
  'description',
  'createdDateTime',
  'modifiedDateTime',
  'deletedDateTime',
  'state',
  'templateId',
  'partialEnablementStrategy',
  'sessionControls.signInFrequency.authenticationType',
]);

/**
 * Raw Graph paths read by a dedicated reshaper below rather than by COPY_PAIRS. The
 * prefixes are whole objects identified as one unit (a strength by its id, guest
 * targeting as one flattened set).
 */
const CONSUMED_PATHS: ReadonlySet<string> = new Set([
  'sessionControls.signInFrequency.value',
  'sessionControls.signInFrequency.type',
  'sessionControls.signInFrequency.frequencyInterval',
  'conditions.devices.deviceFilter.mode',
  'conditions.devices.deviceFilter.rule',
  'conditions.authenticationFlows.transferMethods',
]);
const CONSUMED_PREFIXES: readonly string[] = [
  'grantControls.authenticationStrength.',
  'conditions.users.includeGuestsOrExternalUsers.',
  'conditions.users.excludeGuestsOrExternalUsers.',
];

export const COPY_PAIRS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['conditions.applications.includeApplications', 'applications.includeApplications'],
  ['conditions.applications.excludeApplications', 'applications.excludeApplications'],
  ['conditions.applications.includeUserActions', 'applications.includeUserActions'],
  [
    'conditions.applications.includeAuthenticationContextClassReferences',
    'applications.includeAuthenticationContextClassReferences',
  ],

  ['conditions.users.includeUsers', 'users.includeUsers'],
  ['conditions.users.excludeUsers', 'users.excludeUsers'],
  ['conditions.users.includeGroups', 'users.includeGroups'],
  ['conditions.users.excludeGroups', 'users.excludeGroups'],
  ['conditions.users.includeRoles', 'users.includeRoles'],
  ['conditions.users.excludeRoles', 'users.excludeRoles'],

  ['conditions.clientAppTypes', 'clientAppTypes'],
  ['conditions.platforms.includePlatforms', 'platforms.includePlatforms'],
  ['conditions.platforms.excludePlatforms', 'platforms.excludePlatforms'],

  ['conditions.locations.includeLocations', 'conditions.locations.includeLocations'],
  ['conditions.locations.excludeLocations', 'conditions.locations.excludeLocations'],

  ['conditions.signInRiskLevels', 'conditions.signInRiskLevels'],
  ['conditions.userRiskLevels', 'conditions.userRiskLevels'],
  ['conditions.insiderRiskLevels', 'conditions.insiderRiskLevels'],
  ['conditions.servicePrincipalRiskLevels', 'conditions.servicePrincipalRiskLevels'],
  ['conditions.agentIdRiskLevels', 'conditions.agentIdRiskLevels'],

  ['grantControls.builtInControls', 'grantControls.builtInControls'],
  ['grantControls.operator', 'grantControls.operator'],
  ['grantControls.termsOfUse', 'grantControls.termsOfUse'],
  ['grantControls.customAuthenticationFactors', 'grantControls.customAuthenticationFactors'],

  ['sessionControls.signInFrequency.isEnabled', 'sessionControls.signInFrequency.isEnabled'],
  ['sessionControls.persistentBrowser.isEnabled', 'sessionControls.persistentBrowser.isEnabled'],
  ['sessionControls.persistentBrowser.mode', 'sessionControls.persistentBrowser.mode'],
  [
    'sessionControls.applicationEnforcedRestrictions.isEnabled',
    'sessionControls.applicationEnforcedRestrictions.isEnabled',
  ],
  ['sessionControls.cloudAppSecurity.isEnabled', 'sessionControls.cloudAppSecurity.isEnabled'],
  [
    'sessionControls.cloudAppSecurity.cloudAppSecurityType',
    'sessionControls.cloudAppSecurity.cloudAppSecurityType',
  ],
  ['sessionControls.secureSignInSession.isEnabled', 'sessionControls.secureSignInSession.tokenProtection'],
  ['sessionControls.continuousAccessEvaluation.mode', 'sessionControls.continuousAccessEvaluation.mode'],
  ['sessionControls.disableResilienceDefaults', 'sessionControls.disableResilienceDefaults'],
];

const read = (root: RawObject, path: string): RawValue | undefined => {
  let cur: RawValue | undefined = root;
  for (const seg of path.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
};

const mapState = (raw: unknown): PolicyState => {
  if (raw === 'enabled') return 'enabled';
  if (raw === 'enabledForReportingButNotEnforced') return 'reportOnly';
  return 'disabled';
};

/** Graph's signInFrequency splits across value/type; render it as one readable scalar. */
function signInInterval(policy: RawObject): string | undefined {
  const sif = read(policy, 'sessionControls.signInFrequency');
  if (!isPlainObject(sif)) return undefined;
  if (sif['frequencyInterval'] === 'everyTime') return 'every time';
  const value = sif['value'];
  const type = sif['type'];
  if (typeof value === 'number' && typeof type === 'string') {
    // Graph's type is plural ("hours", "days"); singularise for a value of 1.
    return `${value} ${value === 1 ? type.replace(/s$/, '') : type}`;
  }
  return undefined;
}

/** Graph flags enums serialise as one comma-separated string; the baselines use arrays. */
const splitFlags = (v: string): string[] =>
  v
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

function transferMethods(policy: RawObject): RawValue | undefined {
  const v = read(policy, 'conditions.authenticationFlows.transferMethods');
  if (typeof v === 'string') return splitFlags(v);
  return v === null ? undefined : v;
}

/**
 * The three built-in authentication strengths, by their fixed ids, mapped onto the values
 * the baseline corpus uses. Graph's own `requirementsSatisfied` is `none | mfa` only, so
 * it reports all three built-ins as "mfa" - reading it made phishing-resistant MFA
 * indistinguishable from plain MFA.
 */
const BUILT_IN_STRENGTHS: Readonly<Record<string, string>> = {
  '00000000-0000-0000-0000-000000000002': 'mfa',
  '00000000-0000-0000-0000-000000000003': 'passwordlessMfa',
  '00000000-0000-0000-0000-000000000004': 'phishingResistant',
};

/**
 * Which strength a policy requires. A custom strength is named by the export's own
 * displayName, never by us; with no name it stays a raw id.
 */
function authStrength(policy: RawObject): string | undefined {
  const as = read(policy, 'grantControls.authenticationStrength');
  if (!isPlainObject(as)) return undefined;
  const id = typeof as['id'] === 'string' ? as['id'] : '';
  const builtIn = BUILT_IN_STRENGTHS[id.toLowerCase()];
  if (builtIn) return builtIn;
  if (typeof as['displayName'] === 'string' && as['displayName']) return as['displayName'];
  return id || undefined;
}

/**
 * Graph's guest targeting is an object - a comma-separated type list plus the external
 * tenants it covers - where the baselines assert a bare `true`. Flattened to one set:
 * the guest types, then any enumerated tenant ids. `membershipKind: "all"` adds nothing,
 * because covering every tenant is what an unrestricted type list already says.
 */
function guests(policy: RawObject, which: 'include' | 'exclude'): RawValue | undefined {
  const g = read(policy, `conditions.users.${which}GuestsOrExternalUsers`);
  if (!isPlainObject(g)) return undefined;
  const typesRaw = g['guestOrExternalUserTypes'];
  const types = typeof typesRaw === 'string' ? splitFlags(typesRaw) : [];
  const ext = g['externalTenants'];
  const members =
    isPlainObject(ext) && ext['membershipKind'] === 'enumerated' && Array.isArray(ext['members'])
      ? (ext['members'] as RawValue[]).filter((m): m is string => typeof m === 'string')
      : [];
  return [...types, ...members];
}

/** Every non-null leaf of the raw source, with its value. `@odata` annotations are skipped. */
function rawLeaves(root: RawObject, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(root)) {
    if (k.includes('@odata')) continue;
    if (v === null || v === undefined) continue;
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) {
      // An empty Graph container is structure, not an assertion.
      if (Object.keys(v).length > 0) out.push(...rawLeaves(v, path));
    } else {
      out.push(path);
    }
  }
  return out;
}

const COPIED_FROM: ReadonlySet<string> = new Set(COPY_PAIRS.map(([from]) => from));

/**
 * THE GUARD, for tenant input. extractFacets' own census sees only the reshaped object,
 * which by construction holds nothing but what this adapter chose to copy - so a Graph
 * field missing from COPY_PAIRS would vanish without a trace. This walks the SOURCE and
 * reports every populated leaf nobody read.
 */
function rawCensus(raw: RawObject): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const leaf of rawLeaves(raw)) {
    if (IGNORED.has(leaf) || COPIED_FROM.has(leaf) || CONSUMED_PATHS.has(leaf)) continue;
    if (CONSUMED_PREFIXES.some((p) => leaf.startsWith(p))) continue;
    anomalies.push({ path: leaf, reason: 'unknown-path' });
  }
  return anomalies;
}

/** Graph expresses device targeting as a filter rule, not a boolean. */
function deviceFilter(policy: RawObject): string | undefined {
  const df = read(policy, 'conditions.devices.deviceFilter');
  if (!isPlainObject(df)) return undefined;
  const mode = typeof df['mode'] === 'string' ? df['mode'] : '';
  const rule = typeof df['rule'] === 'string' ? df['rule'] : '';
  if (!rule) return undefined;
  return mode ? `${mode}: ${rule}` : rule;
}

export function normalizeGraphPolicy(raw: RawObject, index: number): NormalizedPolicy {
  const canonical: Record<string, RawValue> = {};

  for (const [from, to] of COPY_PAIRS) {
    const v = read(raw, from);
    if (v !== undefined && v !== null) setPath(canonical, to, v);
  }

  const interval = signInInterval(raw);
  if (interval) setPath(canonical, 'sessionControls.signInFrequency.interval', interval);

  const filter = deviceFilter(raw);
  if (filter) setPath(canonical, 'deviceState.deviceFilter', filter);

  const flows = transferMethods(raw);
  if (flows !== undefined) setPath(canonical, 'conditions.authenticationFlows.transferMethods', flows);

  const strength = authStrength(raw);
  if (strength) {
    setPath(canonical, 'grantControls.authenticationStrength.requirementsSatisfied', strength);
  }

  const includeGuests = guests(raw, 'include');
  if (includeGuests) setPath(canonical, 'users.includeGuestsOrExternalUsers', includeGuests);
  const excludeGuests = guests(raw, 'exclude');
  if (excludeGuests) setPath(canonical, 'users.excludeGuestsOrExternalUsers', excludeGuests);

  const extracted = extractFacets(canonical);
  const facets = extracted.facets;
  const anomalies = [...extracted.anomalies, ...rawCensus(raw)];

  const id = typeof raw['id'] === 'string' ? raw['id'] : `loaded-${index + 1}`;
  const name =
    typeof raw['displayName'] === 'string' && raw['displayName']
      ? raw['displayName']
      : `Loaded policy ${index + 1}`;

  return {
    source: 'tenant',
    policyKey: `tenant~${index}`,
    id,
    name,
    state: mapState(raw['state']),
    facets,
    anomalies,
  };
}

export class PolicyParseError extends Error {}

/**
 * Accepts what people actually have to hand: a single policy, a bare array, or the
 * `{ value: [...] }` envelope that Graph and Graph Explorer return.
 */
export function parsePolicyFile(text: string): NormalizedPolicy[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PolicyParseError('That file is not valid JSON.');
  }

  let list: unknown[];
  if (Array.isArray(json)) list = json;
  else if (isPlainObject(json) && Array.isArray(json['value'])) list = json['value'] as unknown[];
  else if (isPlainObject(json)) list = [json];
  else throw new PolicyParseError('Expected a policy object, an array, or a { value: [...] } response.');

  const policies = list.filter(isPlainObject);
  if (policies.length === 0) {
    throw new PolicyParseError('No policy objects found in that file.');
  }

  const looksLikeCA = policies.some(
    (p) => 'conditions' in p || 'grantControls' in p || 'sessionControls' in p,
  );
  if (!looksLikeCA) {
    throw new PolicyParseError(
      'That JSON has no conditions, grantControls or sessionControls - it does not look like a Conditional Access export.',
    );
  }

  return policies.map((p, i) => normalizeGraphPolicy(p, i));
}
