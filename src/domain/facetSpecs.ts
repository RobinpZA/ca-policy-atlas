/**
 * THE closed taxonomy.
 *
 * This one ordered array is the single source of truth for:
 *   - extraction      (which paths become facets)
 *   - node membership (which facets render in which node)
 *   - rank order      (vertical position, shared across every column)
 *   - the diff        (the ordered union of paths to compare)
 *   - the census guard (any source leaf not claimed here is data we are dropping)
 *
 * Paths here are CANONICAL. Source adapters reshape their input to match - see
 * aliases.ts for the baseline corpus's dual encodings, and adapters/fromGraph.ts for
 * the real Graph schema. Nothing downstream ever sees the original shape.
 */

import type { FacetSpec, NodeKey } from './types.ts';

export interface NodeSpec {
  readonly key: NodeKey;
  readonly rank: number;
  /** Shown once in the sticky rank gutter, not repeated on every node. */
  readonly title: string;
}

export const NODE_SPECS: readonly NodeSpec[] = [
  { key: 'policy.head', rank: 0, title: 'Policy' },
  { key: 'scope.apps', rank: 1, title: 'Applications' },
  { key: 'scope.users', rank: 2, title: 'Users' },
  { key: 'cond.clientApps', rank: 3, title: 'Client apps' },
  { key: 'cond.platforms', rank: 4, title: 'Platforms' },
  { key: 'cond.deviceState', rank: 5, title: 'Device state' },
  { key: 'cond.locations', rank: 6, title: 'Locations' },
  { key: 'cond.signInRisk', rank: 7, title: 'Sign-in risk' },
  { key: 'cond.userRisk', rank: 8, title: 'User risk' },
  { key: 'cond.otherRisk', rank: 9, title: 'Other risk' },
  { key: 'cond.authFlows', rank: 10, title: 'Auth flows' },
  { key: 'ctrl.grant', rank: 11, title: 'Grant' },
  { key: 'ctrl.session', rank: 12, title: 'Session' },
  { key: 'end.terminal', rank: 13, title: 'Outcome' },
];

export const NODE_SPEC_BY_KEY: ReadonlyMap<NodeKey, NodeSpec> = new Map(
  NODE_SPECS.map((n) => [n.key, n]),
);

/**
 * Ordered facet specs. Order within a node determines row order inside that node.
 *
 * Exclusion facets are barely used by the baselines but are heavily used by real tenant
 * policies. They are declared here from day one so the Graph adapter needs no schema change.
 */
export const FACET_SPECS: readonly FacetSpec[] = [
  // -- rank 1: applications -------------------------------------------------
  {
    path: 'applications.includeApplications',
    node: 'scope.apps',
    rank: 1,
    label: 'Include apps',
    polarity: 'include',
    tokenKind: 'appId',
  },
  {
    path: 'applications.excludeApplications',
    node: 'scope.apps',
    rank: 1,
    label: 'Exclude apps',
    polarity: 'exclude',
    tokenKind: 'appId',
  },
  {
    path: 'applications.includeUserActions',
    node: 'scope.apps',
    rank: 1,
    label: 'User actions',
    polarity: 'include',
    tokenKind: 'userAction',
  },
  {
    path: 'applications.includeAuthenticationContextClassReferences',
    node: 'scope.apps',
    rank: 1,
    label: 'Auth context',
    polarity: 'include',
    tokenKind: 'raw',
  },

  // -- rank 2: users --------------------------------------------------------
  {
    path: 'users.includeUsers',
    node: 'scope.users',
    rank: 2,
    label: 'Include users',
    polarity: 'include',
    tokenKind: 'identity',
  },
  {
    path: 'users.includeGroups',
    node: 'scope.users',
    rank: 2,
    label: 'Include groups',
    polarity: 'include',
    tokenKind: 'identity',
  },
  {
    path: 'users.includeRoles',
    node: 'scope.users',
    rank: 2,
    label: 'Include roles',
    polarity: 'include',
    tokenKind: 'identity',
  },
  {
    path: 'users.includeGuestsOrExternalUsers',
    node: 'scope.users',
    rank: 2,
    label: 'Include guests',
    polarity: 'include',
    tokenKind: 'raw',
  },
  {
    path: 'users.excludeUsers',
    node: 'scope.users',
    rank: 2,
    label: 'Exclude users',
    polarity: 'exclude',
    tokenKind: 'identity',
  },
  {
    path: 'users.excludeGroups',
    node: 'scope.users',
    rank: 2,
    label: 'Exclude groups',
    polarity: 'exclude',
    tokenKind: 'identity',
  },
  {
    path: 'users.excludeRoles',
    node: 'scope.users',
    rank: 2,
    label: 'Exclude roles',
    polarity: 'exclude',
    tokenKind: 'identity',
  },
  {
    path: 'users.excludeGuestsOrExternalUsers',
    node: 'scope.users',
    rank: 2,
    label: 'Exclude guests',
    polarity: 'exclude',
    tokenKind: 'raw',
  },

  // -- rank 3: client app types --------------------------------------------
  {
    path: 'clientAppTypes',
    node: 'cond.clientApps',
    rank: 3,
    label: 'Client app types',
    polarity: 'value',
    tokenKind: 'clientAppType',
  },

  // -- rank 4: platforms ----------------------------------------------------
  {
    path: 'platforms.includePlatforms',
    node: 'cond.platforms',
    rank: 4,
    label: 'Include platforms',
    polarity: 'include',
    tokenKind: 'platform',
  },
  {
    path: 'platforms.excludePlatforms',
    node: 'cond.platforms',
    rank: 4,
    label: 'Exclude platforms',
    polarity: 'exclude',
    tokenKind: 'platform',
  },

  // -- rank 5: device state -------------------------------------------------
  {
    path: 'deviceState.requireCompliant',
    node: 'cond.deviceState',
    rank: 5,
    label: 'Compliant device',
    polarity: 'require',
    tokenKind: 'bool',
  },
  {
    path: 'deviceState.deviceFilter',
    node: 'cond.deviceState',
    rank: 5,
    label: 'Device filter',
    polarity: 'value',
    tokenKind: 'deviceFilter',
  },

  // -- rank 6: locations ----------------------------------------------------
  {
    path: 'conditions.locations.includeLocations',
    node: 'cond.locations',
    rank: 6,
    label: 'Include locations',
    polarity: 'include',
    tokenKind: 'location',
  },
  {
    path: 'conditions.locations.excludeLocations',
    node: 'cond.locations',
    rank: 6,
    label: 'Exclude locations',
    polarity: 'exclude',
    tokenKind: 'location',
  },

  // -- ranks 7-9: risk ------------------------------------------------------
  {
    path: 'conditions.signInRiskLevels',
    node: 'cond.signInRisk',
    rank: 7,
    label: 'Sign-in risk',
    polarity: 'value',
    tokenKind: 'riskLevel',
  },
  {
    path: 'conditions.userRiskLevels',
    node: 'cond.userRisk',
    rank: 8,
    label: 'User risk',
    polarity: 'value',
    tokenKind: 'riskLevel',
  },
  {
    path: 'conditions.insiderRiskLevels',
    node: 'cond.otherRisk',
    rank: 9,
    label: 'Insider risk',
    polarity: 'value',
    tokenKind: 'riskLevel',
  },
  {
    path: 'conditions.servicePrincipalRiskLevels',
    node: 'cond.otherRisk',
    rank: 9,
    label: 'Workload identity risk',
    polarity: 'value',
    tokenKind: 'riskLevel',
  },
  {
    path: 'conditions.agentIdRiskLevels',
    node: 'cond.otherRisk',
    rank: 9,
    label: 'Agent ID risk',
    polarity: 'value',
    tokenKind: 'riskLevel',
  },

  // -- rank 10: authentication flows ---------------------------------------
  {
    path: 'conditions.authenticationFlows.transferMethods',
    node: 'cond.authFlows',
    rank: 10,
    label: 'Transfer methods',
    polarity: 'value',
    tokenKind: 'authFlow',
  },

  // -- rank 11: grant controls ---------------------------------------------
  {
    path: 'grantControls.builtInControls',
    node: 'ctrl.grant',
    rank: 11,
    label: 'Controls',
    polarity: 'require',
    tokenKind: 'grantControl',
  },
  {
    path: 'grantControls.authenticationStrength.requirementsSatisfied',
    node: 'ctrl.grant',
    rank: 11,
    label: 'Auth strength',
    polarity: 'require',
    tokenKind: 'authStrength',
  },
  {
    path: 'grantControls.termsOfUse',
    node: 'ctrl.grant',
    rank: 11,
    label: 'Terms of use',
    polarity: 'require',
    tokenKind: 'raw',
  },
  {
    path: 'grantControls.customAuthenticationFactors',
    node: 'ctrl.grant',
    rank: 11,
    label: 'Custom factors',
    polarity: 'require',
    tokenKind: 'raw',
  },
  {
    path: 'grantControls.operator',
    node: 'ctrl.grant',
    rank: 11,
    label: 'Operator',
    polarity: 'value',
    tokenKind: 'operator',
  },
  {
    // CAD006 is the only policy with `grantControls: {}` - the container is declared
    // but asserts nothing. Without this presence-only spec that policy would look
    // identical to one with no grantControls key at all, which is a different claim.
    path: 'grantControls',
    node: 'ctrl.grant',
    rank: 11,
    label: 'Grant controls',
    polarity: 'value',
    tokenKind: 'raw',
    presenceOnly: true,
  },

  // -- rank 12: session controls -------------------------------------------
  {
    path: 'sessionControls.signInFrequency.isEnabled',
    node: 'ctrl.session',
    rank: 12,
    label: 'Sign-in frequency',
    polarity: 'require',
    tokenKind: 'bool',
  },
  {
    path: 'sessionControls.signInFrequency.interval',
    node: 'ctrl.session',
    rank: 12,
    label: 'Frequency interval',
    polarity: 'value',
    tokenKind: 'raw',
  },
  {
    path: 'sessionControls.persistentBrowser.isEnabled',
    node: 'ctrl.session',
    rank: 12,
    label: 'Persistent browser',
    polarity: 'require',
    tokenKind: 'bool',
  },
  {
    path: 'sessionControls.persistentBrowser.mode',
    node: 'ctrl.session',
    rank: 12,
    label: 'Browser mode',
    polarity: 'value',
    tokenKind: 'persistentBrowserMode',
  },
  {
    path: 'sessionControls.applicationEnforcedRestrictions.isEnabled',
    node: 'ctrl.session',
    rank: 12,
    label: 'App-enforced restrictions',
    polarity: 'require',
    tokenKind: 'bool',
  },
  {
    path: 'sessionControls.cloudAppSecurity.isEnabled',
    node: 'ctrl.session',
    rank: 12,
    label: 'Defender for Cloud Apps',
    polarity: 'require',
    tokenKind: 'bool',
  },
  {
    path: 'sessionControls.cloudAppSecurity.cloudAppSecurityType',
    node: 'ctrl.session',
    rank: 12,
    label: 'MDCA mode',
    polarity: 'value',
    tokenKind: 'sessionControl',
  },
  {
    path: 'sessionControls.secureSignInSession.tokenProtection',
    node: 'ctrl.session',
    rank: 12,
    label: 'Token protection',
    polarity: 'require',
    tokenKind: 'bool',
  },
  {
    path: 'sessionControls.continuousAccessEvaluation.mode',
    node: 'ctrl.session',
    rank: 12,
    label: 'Continuous access evaluation',
    polarity: 'value',
    tokenKind: 'sessionControl',
  },
  {
    path: 'sessionControls.disableResilienceDefaults',
    node: 'ctrl.session',
    rank: 12,
    label: 'Resilience defaults disabled',
    polarity: 'value',
    tokenKind: 'bool',
  },
];

export const FACET_SPEC_BY_PATH: ReadonlyMap<string, FacetSpec> = new Map(
  FACET_SPECS.map((s) => [s.path, s]),
);

export const SPEC_PATHS: ReadonlySet<string> = new Set(FACET_SPECS.map((s) => s.path));

/** Facet paths belonging to a node, in declaration order. */
export const FACETS_BY_NODE: ReadonlyMap<NodeKey, readonly string[]> = (() => {
  const m = new Map<NodeKey, string[]>();
  for (const spec of FACET_SPECS) {
    const list = m.get(spec.node);
    if (list) list.push(spec.path);
    else m.set(spec.node, [spec.path]);
  }
  return m;
})();

/** Position of a path in FACET_SPECS - used to keep the diff's path union ordered. */
export const SPEC_ORDER: ReadonlyMap<string, number> = new Map(
  FACET_SPECS.map((s, i) => [s.path, i]),
);
