/**
 * The tenant loader against Microsoft's own published responses.
 *
 * The fixtures are the example responses from the Graph beta "List policies" page
 * (learn.microsoft.com/graph/api/conditionalaccessroot-list-policies), copied verbatim -
 * sample ids, no tenant data. They carry what a hand-written fixture forgets: @odata
 * annotations, nulls on every unused condition, a fully expanded built-in strength with
 * `requirementsSatisfied: "mfa"`, `frequencyInterval: "everyTime"` with null value/type,
 * and an agent-identity filter this app does not model.
 *
 * Refresh them from that page when the schema moves. Never replace them with a real export.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePolicyFile } from '../src/domain/adapters/fromGraph.ts';
import { terminalOf } from '../src/domain/graph/terminal.ts';
import { uncomparedPaths } from '../src/domain/types.ts';

const load = (name: string) =>
  parsePolicyFile(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('Graph beta list-policies example', () => {
  const [admins, risky] = load('graph-list-policies.beta.json');

  it('reads the { value: [...] } envelope', () => {
    expect(admins?.name).toBe('CA001: Require multi-factor authentication for admins');
    expect(risky?.name).toBe('CA008: Require password change for high-risk users');
  });

  it('accounts for every populated field - nulls and @odata annotations included', () => {
    expect(uncomparedPaths(admins!)).toEqual([]);
    expect(uncomparedPaths(risky!)).toEqual([]);
  });

  it('keeps unresolved role ids as raw identifiers rather than naming them', () => {
    const roles = admins!.facets.get('users.includeRoles');
    expect(roles?.display).toHaveLength(15);
    expect(roles?.display.every((d) => !d.resolved && d.label.endsWith('…'))).toBe(true);
  });

  it('reads the expanded built-in strength by id, not by requirementsSatisfied', () => {
    expect(
      risky!.facets.get('grantControls.authenticationStrength.requirementsSatisfied')?.exp,
    ).toMatchObject({ kind: 'scalar', value: 'mfa' });
    // A null strength is absent, not empty.
    expect(admins!.facets.has('grantControls.authenticationStrength.requirementsSatisfied')).toBe(
      false,
    );
  });

  it('renders an every-time sign-in frequency whose value and type are null', () => {
    expect(risky!.facets.get('sessionControls.signInFrequency.interval')?.exp).toMatchObject({
      value: 'every time',
    });
  });

  it('reads the AND operator into the outcome', () => {
    const t = terminalOf(risky!.facets);
    expect(t.tone).toBe('grant');
    expect(t.title).toContain(' and ');
  });
});

describe('Graph beta agent-identity example', () => {
  const [unapproved, agentUsers] = load('graph-agent-policies.beta.json');

  it('flags the agent service-principal filter as not compared, rather than dropping it', () => {
    expect(uncomparedPaths(unapproved!)).toEqual([
      'conditions.clientApplications.agentIdServicePrincipalFilter.mode',
      'conditions.clientApplications.agentIdServicePrincipalFilter.rule',
    ]);
  });

  it('maps the report-only state and still ends in a block', () => {
    expect(unapproved!.state).toBe('reportOnly');
    expect(terminalOf(unapproved!.facets).tone).toBe('block');
  });

  it('names the documented AllAgentIdUsers target', () => {
    expect(agentUsers!.facets.get('users.includeUsers')?.display[0]?.label).toBe('All agent users');
  });
});
