/**
 * Shape canonicalisation.
 *
 * WHY THIS FILE EXISTS. The baseline corpus encodes the same semantic two different
 * ways in several places. Measured over all 94 shipped policies:
 *
 *   sessionControls.signInFrequency                  true  x7
 *   sessionControls.signInFrequency.isEnabled        true  x1   <- same assertion
 *   conditions.locations                             true  x1
 *   conditions.locations.includeLocations            true  x3   <- same assertion
 *   sessionControls.applicationEnforcedRestrictions  true  x1
 *     ...applicationEnforcedRestrictions.isEnabled   true  x1   <- same assertion
 *   grantControls.authenticationStrength             "phishingResistant" x2
 *     ...authenticationStrength.requirementsSatisfied "phishingResistant" x3, "mfa" x5
 *
 * Left uncanonicalised, a CIS policy and a Van Surksum policy asserting exactly the
 * same thing would be reported as DIFFERENT. That is the single worst failure mode
 * this app has, because a false difference is indistinguishable from a real one.
 *
 * THIS TABLE IS A SEMANTIC ASSERTION, NOT A REFACTOR. It claims that
 * `signInFrequency: true` and `{isEnabled: true}` mean the same thing. That is a
 * judgement about the baseline authors' intent. It is kept here, visible and in one
 * place, precisely so it can be reviewed and argued with - rather than buried inside
 * a parser where nobody would ever find it.
 */

import { isPlainObject } from './objectPath.ts';
import type { RawObject, RawValue } from './types.ts';

interface AliasRule {
  /** Dotted path, relative to the root of the pattern object. */
  readonly path: string;
  /** Fires only when the raw value matches this predicate. */
  readonly when: (v: RawValue) => boolean;
  /** Rewrites the value into its canonical nested form. */
  readonly to: (v: RawValue) => RawValue;
  readonly note: string;
}

const isTrue = (v: RawValue): boolean => v === true;
const isString = (v: RawValue): boolean => typeof v === 'string';
const isArray = (v: RawValue): boolean => Array.isArray(v);

export const ALIAS_RULES: readonly AliasRule[] = [
  {
    path: 'sessionControls.signInFrequency',
    when: isTrue,
    to: () => ({ isEnabled: true }),
    note: 'true is shorthand for {isEnabled:true} (7 policies use the shorthand, 1 the long form)',
  },
  {
    path: 'sessionControls.persistentBrowser',
    when: isTrue,
    to: () => ({ isEnabled: true }),
    note: 'defensive - not present in the current corpus, mirrors signInFrequency',
  },
  {
    path: 'sessionControls.applicationEnforcedRestrictions',
    when: isTrue,
    to: () => ({ isEnabled: true }),
    note: 'true is shorthand for {isEnabled:true} (1 policy each way)',
  },
  {
    path: 'sessionControls.cloudAppSecurity',
    when: isTrue,
    to: () => ({ isEnabled: true }),
    note: 'defensive - corpus always uses the long form',
  },
  {
    path: 'sessionControls.secureSignInSession',
    when: isTrue,
    to: () => ({ tokenProtection: true }),
    note: 'the only thing secureSignInSession carries in this corpus is tokenProtection',
  },
  {
    path: 'grantControls.authenticationStrength',
    when: isString,
    to: (v) => ({ requirementsSatisfied: v }),
    note: 'bare string is shorthand for {requirementsSatisfied:"..."} (2 short, 8 long)',
  },
  {
    path: 'conditions.locations',
    when: isTrue,
    to: () => ({ includeLocations: true }),
    note: 'true is shorthand for {includeLocations:true} (1 short, 3 long)',
  },
  {
    path: 'conditions.authenticationFlows',
    when: isArray,
    to: (v) => ({ transferMethods: v }),
    note:
      'the corpus stores a bare array where Graph nests under transferMethods. ' +
      'Note: Format-PolicyFlowJson in CA-BaselineAuditor reads .transferMethods and so ' +
      'renders nothing for these 6 policies - a real bug in that repo, not here.',
  },
];

/**
 * Applies every rule to a CLONE of the input. The caller owns the clone; the imported
 * JSON module is never mutated.
 */
export function applyAliases(pattern: RawObject): RawObject {
  const out = pattern as Record<string, RawValue>;
  for (const rule of ALIAS_RULES) {
    const segs = rule.path.split('.');
    const last = segs[segs.length - 1];
    if (last === undefined) continue;

    let cur: Record<string, RawValue> = out;
    let ok = true;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      if (seg === undefined) {
        ok = false;
        break;
      }
      const next = cur[seg];
      if (!isPlainObject(next)) {
        ok = false;
        break;
      }
      cur = next as Record<string, RawValue>;
    }
    if (!ok) continue;

    const val = cur[last];
    if (val === undefined) continue;
    if (rule.when(val)) cur[last] = rule.to(val);
  }
  return out;
}
