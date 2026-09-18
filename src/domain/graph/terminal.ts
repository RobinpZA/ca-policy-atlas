/**
 * What the policy actually does, as one node.
 *
 * The PowerShell renderer this replaces forks into "Access Granted" and "Access Denied"
 * terminals. That models the runtime branch, but a baseline does not assert a runtime
 * branch - it asserts what must be REQUIRED. Two terminals would therefore be
 * over-modelling, and would cost a rank in every column of every comparison.
 */

import { valuesOf } from '../diff/compare.ts';
import type { FacetMap } from '../types.ts';

export type TerminalTone = 'block' | 'grant' | 'session' | 'none';

export interface Terminal {
  readonly tone: TerminalTone;
  readonly title: string;
  readonly sub?: string;
}

const GRANT_FACETS = [
  'grantControls.builtInControls',
  'grantControls.authenticationStrength.requirementsSatisfied',
  'grantControls.termsOfUse',
  'grantControls.customAuthenticationFactors',
] as const;

const SESSION_PREFIX = 'sessionControls.';

export function terminalOf(facets: FacetMap): Terminal {
  const builtIn = facets.get('grantControls.builtInControls');
  const hasBlock =
    !!builtIn && valuesOf(builtIn.exp).some((v) => v.toLowerCase() === 'block');

  if (hasBlock) {
    return { tone: 'block', title: 'Block access' };
  }

  const grantLabels: string[] = [];
  for (const path of GRANT_FACETS) {
    const f = facets.get(path);
    if (!f) continue;
    if (f.display.length) grantLabels.push(...f.display.map((d) => d.label));
    else if (f.exp.kind === 'wildcard') grantLabels.push('a configured control');
  }

  const hasSession = [...facets.keys()].some((k) => k.startsWith(SESSION_PREFIX));

  if (grantLabels.length) {
    const operator = facets.get('grantControls.operator');
    const joiner =
      operator && valuesOf(operator.exp).some((v) => v.toLowerCase() === 'or') ? ' or ' : ' and ';
    return {
      tone: 'grant',
      title: `Grant if ${grantLabels.join(joiner)}`,
      sub: 'otherwise denied',
    };
  }

  // CAD006 is the only policy with `grantControls: {}` - the container is declared but
  // empty. That is a different claim from having no grantControls key at all, and the
  // reader should be able to see which one they are looking at.
  if (facets.has('grantControls')) {
    return {
      tone: 'session',
      title: 'Session controls only',
      sub: 'grant controls declared but unspecified',
    };
  }

  if (hasSession) {
    return { tone: 'session', title: 'Allow with session controls' };
  }

  // MT.1003, MT.1004, MT.1011 and MT.1071 assert neither grant nor session controls.
  // They are existence checks: "a policy covering this scope must exist". Saying so is
  // more useful than rendering a chain that appears to be broken.
  return {
    tone: 'none',
    title: 'No control asserted',
    sub: 'existence check only',
  };
}
