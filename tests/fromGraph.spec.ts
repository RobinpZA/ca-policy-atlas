/**
 * The tenant-policy adapter.
 *
 * The fixture below is shaped like a real Graph beta `conditionalAccessPolicy`, with
 * the nesting the baselines do NOT have (conditions.applications, conditions.users,
 * conditions.platforms) plus the bookkeeping fields Graph always returns.
 */

import { describe, expect, it } from 'vitest';
import { normalizeGraphPolicy, parsePolicyFile, PolicyParseError } from '../src/domain/adapters/fromGraph.ts';
import { diffSelection } from '../src/domain/diff/diffSelection.ts';
import { terminalOf } from '../src/domain/graph/terminal.ts';
import { BASELINES } from '../src/data/loadBaselines.ts';
import type { RawObject } from '../src/domain/types.ts';

const TENANT_POLICY: RawObject = {
  id: '0f4a2b71-3c9d-4e1f-8a62-7d5b9c0e1234',
  displayName: 'CA01 - Require MFA for all users',
  createdDateTime: '2025-03-04T09:12:44Z',
  modifiedDateTime: '2026-01-19T14:02:10Z',
  state: 'enabledForReportingButNotEnforced',
  templateId: null,
  conditions: {
    userRiskLevels: [],
    signInRiskLevels: ['high', 'medium'],
    clientAppTypes: ['all'],
    platforms: { includePlatforms: ['windows', 'macOS'], excludePlatforms: [] },
    locations: { includeLocations: ['All'], excludeLocations: ['AllTrusted'] },
    devices: { deviceFilter: { mode: 'exclude', rule: 'device.isCompliant -eq True' } },
    applications: {
      includeApplications: ['All'],
      excludeApplications: ['0000000a-0000-0000-c000-000000000000'],
      includeUserActions: [],
    },
    users: {
      includeUsers: ['All'],
      excludeUsers: ['a1b2c3d4-0000-0000-0000-00000000aaaa'],
      includeGroups: [],
      excludeGroups: ['b2c3d4e5-0000-0000-0000-00000000bbbb'],
      includeRoles: [],
      excludeRoles: [],
    },
  },
  grantControls: {
    operator: 'OR',
    builtInControls: ['mfa'],
    customAuthenticationFactors: [],
    termsOfUse: [],
    authenticationStrength: {
      id: '00000000-0000-0000-0000-000000000004',
      displayName: 'Phishing-resistant MFA',
      requirementsSatisfied: 'mfa',
    },
  },
  sessionControls: {
    signInFrequency: { value: 4, type: 'hours', isEnabled: true, frequencyInterval: 'timeBased' },
    persistentBrowser: { mode: 'never', isEnabled: true },
    cloudAppSecurity: null,
  },
};

describe('normalizeGraphPolicy', () => {
  const p = normalizeGraphPolicy(TENANT_POLICY, 0);

  it('lifts Graph nesting onto the same canonical paths the baselines use', () => {
    expect(p.facets.get('applications.includeApplications')?.exp).toMatchObject({
      kind: 'set',
      values: ['All'],
    });
    expect(p.facets.get('users.includeUsers')?.exp).toMatchObject({ kind: 'set' });
    expect(p.facets.get('platforms.includePlatforms')?.display.map((d) => d.label)).toEqual([
      'Windows',
      'macOS',
    ]);
    expect(p.facets.get('clientAppTypes')?.display[0]?.label).toBe('All client apps');
  });

  it('keeps exclusions, which baselines barely use but real policies rely on', () => {
    expect(p.facets.get('users.excludeUsers')?.exp.kind).toBe('set');
    expect(p.facets.get('users.excludeGroups')?.exp.kind).toBe('set');
    expect(p.facets.get('applications.excludeApplications')?.display[0]?.label).toBe(
      'Microsoft Intune',
    );
  });

  it('treats an empty Graph array as declared-but-unspecified, not as absent', () => {
    // conditions.userRiskLevels is [] here - the policy mentions it and says nothing.
    expect(p.facets.get('conditions.userRiskLevels')?.exp.kind).toBe('empty');
    // includeUserActions is [] too, and must not be confused with a real user action.
    expect(p.facets.get('applications.includeUserActions')?.exp.kind).toBe('empty');
  });

  it('flattens signInFrequency value+type into one readable scalar', () => {
    expect(p.facets.get('sessionControls.signInFrequency.isEnabled')?.exp.kind).toBe('wildcard');
    expect(p.facets.get('sessionControls.signInFrequency.interval')?.exp).toMatchObject({
      kind: 'scalar',
      value: '4 hours',
    });
  });

  it('renders the device filter rule rather than pretending it is a boolean', () => {
    expect(p.facets.get('deviceState.deviceFilter')?.exp).toMatchObject({
      kind: 'scalar',
      value: 'exclude: device.isCompliant -eq True',
    });
  });

  it('maps the report-only state to something a human recognises', () => {
    expect(p.state).toBe('reportOnly');
    expect(p.source).toBe('tenant');
    expect(p.name).toBe('CA01 - Require MFA for all users');
  });

  it('raises no anomalies - Graph bookkeeping fields are known and ignored, not dropped', () => {
    expect(p.anomalies.filter((a) => a.reason === 'unknown-path')).toEqual([]);
  });

  it('ends in a grant terminal', () => {
    expect(terminalOf(p.facets).tone).toBe('grant');
  });
});

describe('Graph shapes the baselines do not share', () => {
  const withGrant = (authenticationStrength: RawObject): RawObject => ({
    ...TENANT_POLICY,
    grantControls: { operator: 'OR', builtInControls: [], authenticationStrength },
  });
  const strengthOf = (policy: RawObject) =>
    normalizeGraphPolicy(policy, 0).facets.get(
      'grantControls.authenticationStrength.requirementsSatisfied',
    )?.exp;

  it('identifies a built-in strength by id, not by requirementsSatisfied', () => {
    // Graph reports "mfa" for all three built-ins. Reading that field made
    // phishing-resistant MFA indistinguishable from plain MFA.
    expect(strengthOf(TENANT_POLICY)).toMatchObject({ kind: 'scalar', value: 'phishingResistant' });
    expect(
      strengthOf(withGrant({ id: '00000000-0000-0000-0000-000000000002', requirementsSatisfied: 'mfa' })),
    ).toMatchObject({ value: 'mfa' });
    expect(
      strengthOf(withGrant({ id: '00000000-0000-0000-0000-000000000003', requirementsSatisfied: 'mfa' })),
    ).toMatchObject({ value: 'passwordlessMfa' });
  });

  it('names a custom strength by the export own displayName, or leaves it a raw id', () => {
    const id = 'c0ffee00-1111-2222-3333-444455556666';
    expect(
      strengthOf(withGrant({ id, displayName: 'FIDO2 only', requirementsSatisfied: 'mfa' })),
    ).toMatchObject({ value: 'FIDO2 only' });
    expect(strengthOf(withGrant({ id, requirementsSatisfied: 'mfa' }))).toMatchObject({ value: id });
  });

  it('matches a baseline asking for phishing-resistant MFA', () => {
    const tenant = normalizeGraphPolicy(TENANT_POLICY, 0);
    const baseline = BASELINES.policies.find(
      (b) =>
        b.facets.get('grantControls.authenticationStrength.requirementsSatisfied')?.exp.key ===
        'phishingresistant',
    )!;
    const d = diffSelection([baseline, tenant]);
    expect(
      d.byPath.get('grantControls.authenticationStrength.requirementsSatisfied')?.status,
    ).toEqual(['same', 'same']);
  });

  it('flattens the guest-targeting object into one comparable set', () => {
    const policy: RawObject = {
      ...TENANT_POLICY,
      conditions: {
        ...(TENANT_POLICY['conditions'] as RawObject),
        users: {
          includeUsers: [],
          includeGuestsOrExternalUsers: {
            guestOrExternalUserTypes: 'internalGuest,b2bCollaborationGuest',
            externalTenants: {
              '@odata.type': '#microsoft.graph.conditionalAccessEnumeratedExternalTenants',
              membershipKind: 'enumerated',
              members: ['d1e2f3a4-0000-0000-0000-00000000cccc'],
            },
          },
          excludeGuestsOrExternalUsers: {
            guestOrExternalUserTypes: 'serviceProvider',
            externalTenants: {
              '@odata.type': '#microsoft.graph.conditionalAccessAllExternalTenants',
              membershipKind: 'all',
            },
          },
        },
      },
    };
    const t = normalizeGraphPolicy(policy, 0);
    expect(t.facets.get('users.includeGuestsOrExternalUsers')?.exp).toMatchObject({
      kind: 'set',
      values: ['internalGuest', 'b2bCollaborationGuest', 'd1e2f3a4-0000-0000-0000-00000000cccc'],
    });
    expect(t.facets.get('users.excludeGuestsOrExternalUsers')?.exp).toMatchObject({
      kind: 'set',
      values: ['serviceProvider'],
    });
    expect(t.anomalies.filter((a) => a.reason === 'unknown-path')).toEqual([]);
  });

  it('splits the transferMethods flags string into a set', () => {
    const policy: RawObject = {
      ...TENANT_POLICY,
      conditions: {
        ...(TENANT_POLICY['conditions'] as RawObject),
        authenticationFlows: { transferMethods: 'deviceCodeFlow,authenticationTransfer' },
      },
    };
    const f = normalizeGraphPolicy(policy, 0).facets.get(
      'conditions.authenticationFlows.transferMethods',
    );
    expect(f?.display.map((d) => d.label)).toEqual(['Device code flow', 'Authentication transfer']);
  });

  it('reports a populated Graph field no adapter reads, and ignores nulls and annotations', () => {
    const policy: RawObject = {
      ...TENANT_POLICY,
      'grantControls@odata.context': 'https://graph.microsoft.com/...',
      conditions: {
        ...(TENANT_POLICY['conditions'] as RawObject),
        clientApplications: { includeServicePrincipals: ['ServicePrincipalsInMyTenant'] },
        times: null,
      },
    };
    const unknown = normalizeGraphPolicy(policy, 0)
      .anomalies.filter((a) => a.reason === 'unknown-path')
      .map((a) => a.path);
    expect(unknown).toEqual(['conditions.clientApplications.includeServicePrincipals']);
  });

  it('singularises a sign-in frequency of one', () => {
    const policy: RawObject = {
      ...TENANT_POLICY,
      sessionControls: { signInFrequency: { value: 1, type: 'days', isEnabled: true } },
    };
    expect(
      normalizeGraphPolicy(policy, 0).facets.get('sessionControls.signInFrequency.interval')?.exp,
    ).toMatchObject({ value: '1 day' });
  });
});

describe('comparing a tenant policy against a baseline', () => {
  it('reads a baseline wildcard against a concrete tenant value as a specificity gap', () => {
    const tenant = normalizeGraphPolicy(TENANT_POLICY, 0);
    const cis = BASELINES.byKey.get('CIS~CIS-5.2.2.4')!;

    const d = diffSelection([cis, tenant]);
    // CIS asserts persistentBrowser.mode: "never"; the tenant policy sets the same.
    expect(d.byPath.get('sessionControls.persistentBrowser.mode')?.status).toEqual([
      'same',
      'same',
    ]);
    // CIS says signInFrequency must be enabled (wildcard); the tenant has it enabled.
    expect(d.byPath.get('sessionControls.signInFrequency.isEnabled')?.status).toEqual([
      'same',
      'same',
    ]);
    // CIS wants roles targeted (wildcard). The tenant policy carries `includeRoles: []`
    // - it mentions the dimension and specifies nothing, which is NOT the same as not
    // mentioning it. That distinction is the point of keeping `empty` separate from
    // both `wildcard` and absence.
    expect(d.byPath.get('users.includeRoles')?.status).toEqual(['differs', 'differs']);
    expect(d.byPath.get('users.includeRoles')?.reason).toBe('unspecified');
  });

  it('marks a control only the tenant policy has as unique to that column', () => {
    const tenant = normalizeGraphPolicy(TENANT_POLICY, 0);
    const cis = BASELINES.byKey.get('CIS~CIS-5.2.2.4')!;
    const d = diffSelection([cis, tenant]);

    // CIS asserts no grant controls at all; the tenant policy requires MFA.
    expect(d.byPath.get('grantControls.builtInControls')?.status).toEqual(['missing', 'only']);
    // And exclusions exist only on the real policy.
    expect(d.byPath.get('users.excludeUsers')?.status).toEqual(['missing', 'only']);
  });
});

describe('parsePolicyFile accepts the shapes people actually have', () => {
  it('reads a bare object, an array, and a Graph { value: [...] } envelope', () => {
    expect(parsePolicyFile(JSON.stringify(TENANT_POLICY))).toHaveLength(1);
    expect(parsePolicyFile(JSON.stringify([TENANT_POLICY, TENANT_POLICY]))).toHaveLength(2);
    expect(parsePolicyFile(JSON.stringify({ value: [TENANT_POLICY] }))).toHaveLength(1);
  });

  it('gives a usable message rather than a stack trace', () => {
    expect(() => parsePolicyFile('{not json')).toThrow(PolicyParseError);
    expect(() => parsePolicyFile('{"hello":"world"}')).toThrow(/Conditional Access/);
    expect(() => parsePolicyFile('[]')).toThrow(/No policy objects/);
  });
});
