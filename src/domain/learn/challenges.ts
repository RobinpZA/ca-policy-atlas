/**
 * Guided challenges: build a policy, then score it against a real baseline policy using
 * the Coverage view's own rules (coverage.ts). No second scoring scheme exists.
 *
 * Every challenge carries a solution, and tests/challenges.spec.ts proves each one
 * scores fully met - so a baseline refresh that moves the goalposts fails the gate
 * instead of silently making a challenge impossible.
 */

import { BASELINES } from '../../data/loadBaselines.ts';
import { matchTenant, type TenantMatch } from '../diff/coverage.ts';
import type { PolicyKey } from '../types.ts';
import { draftToPolicy, type Draft } from './draft.ts';

export interface Challenge {
  readonly id: string;
  readonly title: string;
  readonly goal: string;
  readonly hint: string;
  /** The baseline policy the attempt is scored against. */
  readonly baseline: PolicyKey;
  readonly solution: Draft['slots'];
}

const EVERYONE = {
  'users.includeUsers': ['All'],
  'applications.includeApplications': ['All'],
} as const;

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'legacy-auth',
    title: 'Block legacy authentication',
    goal: 'Old protocols such as POP, IMAP and Exchange ActiveSync cannot do MFA. Block them for everyone, in every app.',
    hint: 'Client apps holds the legacy types: "Other clients" and "Exchange ActiveSync".',
    baseline: 'CIS~CIS-5.2.2.3',
    solution: {
      ...EVERYONE,
      clientAppTypes: ['other', 'exchangeactivesync'],
      'grantControls.builtInControls': ['block'],
    },
  },
  {
    id: 'mfa-everyone',
    title: 'MFA for everyone',
    goal: 'Require multifactor authentication for all users, in all apps, from any client.',
    hint: 'Setting Client apps to "All client apps" is not the same as leaving it unset. The baseline asks for it explicitly.',
    baseline: 'Maester~MT.1007',
    solution: {
      ...EVERYONE,
      clientAppTypes: ['all'],
      'grantControls.builtInControls': ['mfa'],
    },
  },
  {
    id: 'unknown-platforms',
    title: 'Block unknown platforms',
    goal: 'Block sign-ins from any device platform you do not support. Allow Windows, macOS, iOS, Android and Linux.',
    hint: 'Include all platforms, exclude the five you support, then block.',
    baseline: 'Maester~MT.1015',
    solution: {
      ...EVERYONE,
      clientAppTypes: ['all'],
      'platforms.includePlatforms': ['all'],
      'platforms.excludePlatforms': ['android', 'ios', 'windows', 'macos', 'linux'],
      'grantControls.builtInControls': ['block'],
    },
  },
  {
    id: 'high-risk-signin',
    title: 'Block high-risk sign-ins',
    goal: 'When Entra ID Protection rates a sign-in as high risk, block it.',
    hint: 'This is sign-in risk, not user risk. Pick only High.',
    baseline: 'CISA~MS.AAD.2.3',
    solution: {
      ...EVERYONE,
      clientAppTypes: ['all'],
      'conditions.signInRiskLevels': ['high'],
      'grantControls.builtInControls': ['block'],
    },
  },
  {
    id: 'browser-persistence',
    title: 'No persistent browser sessions',
    goal: 'In the browser, never keep people signed in after they close it.',
    hint: 'This is a session control, not a grant control. Limit Client apps to the browser.',
    baseline: 'Maester~MT.1017',
    solution: {
      ...EVERYONE,
      clientAppTypes: ['browser'],
      'sessionControls.persistentBrowser.mode': ['never'],
    },
  },
];

export interface ChallengeResult extends TenantMatch {
  readonly passed: boolean;
}

export function checkChallenge(challenge: Challenge, draft: Draft): ChallengeResult {
  const baseline = BASELINES.byKey.get(challenge.baseline);
  if (!baseline) throw new Error(`Challenge ${challenge.id}: baseline ${challenge.baseline} is gone`);
  const match = matchTenant(baseline, draftToPolicy(draft, 0));
  return { ...match, passed: match.unmet.length === 0 && match.conflict.length === 0 };
}
