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
import type { NormalizedPolicy, PolicyState, RawObject, RawValue } from '../types.ts';

/** Graph fields that are real but carry no comparable design intent. */
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
  'grantControls.authenticationStrength.id',
  'grantControls.authenticationStrength.displayName',
  'grantControls.authenticationStrength.description',
  'grantControls.authenticationStrength.policyType',
  'grantControls.authenticationStrength.createdDateTime',
  'grantControls.authenticationStrength.modifiedDateTime',
  'grantControls.authenticationStrength.allowedCombinations',
  'sessionControls.signInFrequency.value',
  'sessionControls.signInFrequency.type',
  'sessionControls.signInFrequency.authenticationType',
  'sessionControls.signInFrequency.frequencyInterval',
  'deviceState.deviceFilterMode',
]);

const COPY_PAIRS: ReadonlyArray<readonly [from: string, to: string]> = [
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
  ['conditions.users.includeGuestsOrExternalUsers', 'users.includeGuestsOrExternalUsers'],
  ['conditions.users.excludeGuestsOrExternalUsers', 'users.excludeGuestsOrExternalUsers'],

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
  [
    'conditions.authenticationFlows.transferMethods',
    'conditions.authenticationFlows.transferMethods',
  ],

  ['grantControls.builtInControls', 'grantControls.builtInControls'],
  ['grantControls.operator', 'grantControls.operator'],
  ['grantControls.termsOfUse', 'grantControls.termsOfUse'],
  ['grantControls.customAuthenticationFactors', 'grantControls.customAuthenticationFactors'],
  [
    'grantControls.authenticationStrength.requirementsSatisfied',
    'grantControls.authenticationStrength.requirementsSatisfied',
  ],

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
    return `${value} ${type}${value === 1 ? '' : ''}`;
  }
  return undefined;
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

  const { facets, anomalies } = extractFacets(canonical, { ignorePaths: IGNORED });

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
