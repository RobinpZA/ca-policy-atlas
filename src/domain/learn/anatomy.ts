/**
 * What each rank of a Conditional Access policy is for, in plain language.
 *
 * Keyed by NodeKey as a Record, so adding a rank to facetSpecs.ts fails the typecheck
 * here until somebody explains it. Copy only - no list of dimensions lives here.
 */

import type { NodeKey } from '../types.ts';

export interface AnatomyEntry {
  /** What this part of the policy says. */
  readonly what: string;
  /** Why a policy author cares. */
  readonly why: string;
  /** The mistake people actually make here. */
  readonly pitfall: string;
}

export const ANATOMY: Readonly<Record<NodeKey, AnatomyEntry>> = {
  'policy.head': {
    what: 'The name and state. State is On, Off, or Report-only, which logs what the policy would have done without enforcing it.',
    why: 'Every policy is evaluated at every sign-in. Report-only is how you find out who a new policy would lock out before it does.',
    pitfall: 'Switching a new policy straight to On. Run it in Report-only first and read the sign-in logs.',
  },
  'scope.apps': {
    what: 'Which cloud apps (target resources) the policy covers: all of them, a suite like Office 365, or single apps. Some apps can be excluded.',
    why: 'Together with Users, this is the scope. Conditions and controls only apply inside it.',
    pitfall: 'Targeting single apps and missing the rest. Most baselines target All apps and narrow with conditions instead.',
  },
  'scope.users': {
    what: 'Who the policy covers: users, groups, directory roles or guests, each with an include and an exclude list.',
    why: 'Exclude always beats include. That is how emergency (break-glass) accounts stay outside a policy that could lock everyone out.',
    pitfall: 'No break-glass exclusion on a block or MFA policy for All users. One misconfiguration then locks every admin out too.',
  },
  'cond.clientApps': {
    what: 'How the person is signing in: a browser, a modern desktop or mobile app, Exchange ActiveSync, or "other clients" (legacy protocols like POP and IMAP).',
    why: 'Legacy protocols cannot do MFA. Blocking "other clients" is how you close that gap.',
    pitfall: 'Leaving it unset and assuming it only means modern apps. Unset means every client type.',
  },
  'cond.platforms': {
    what: 'The device operating system the sign-in reports: Windows, macOS, iOS, Android, Linux.',
    why: 'Lets you block platforms you do not manage, or apply a control only on mobile.',
    pitfall: 'The platform is reported by the client and can be spoofed. Use it to scope a policy, not as a security boundary on its own.',
  },
  'cond.deviceState': {
    what: 'A filter on device properties, such as whether it is compliant or which model it is.',
    why: 'Targets or skips managed devices without writing a separate policy per device type.',
    pitfall: 'Using a filter where a grant control would do. "Require compliant device" in Grant is usually the clearer way to say it.',
  },
  'cond.locations': {
    what: 'Where the sign-in comes from: named IP ranges or countries, with an include and an exclude list.',
    why: 'Lets you relax or tighten controls by network, for example blocking countries you never operate from.',
    pitfall: 'Treating "trusted location" as "no MFA needed". An attacker on your guest Wi-Fi is also on a trusted IP.',
  },
  'cond.signInRisk': {
    what: 'How likely Entra ID Protection thinks this one sign-in is not from the account owner: low, medium or high.',
    why: 'Steps up only suspicious sign-ins, so normal ones stay smooth.',
    pitfall: 'Needs Entra ID P2. Without it the condition can be configured but never fires.',
  },
  'cond.userRisk': {
    what: 'How likely Entra ID Protection thinks the account itself is compromised, for example from leaked credentials.',
    why: 'Usually paired with "require password change", which clears the risk once the person proves who they are.',
    pitfall: 'Blocking high-risk users outright with no self-service path. They stay stuck until an admin dismisses the risk.',
  },
  'cond.otherRisk': {
    what: 'Risk signals for insiders, workload identities (service principals) and AI agents.',
    why: 'Extends risk-based policies beyond human sign-ins.',
    pitfall: 'These need extra licensing (Insider Risk Management, Workload Identities Premium). Check before relying on them.',
  },
  'cond.authFlows': {
    what: 'Special sign-in flows: device code flow (typing a code on another device) and authentication transfer (passing a session from desktop to phone).',
    why: 'Device code flow is a common phishing route. Most tenants never need it.',
    pitfall: 'Forgetting that conference-room devices and some CLIs rely on device code flow. Exclude them before you block it.',
  },
  'ctrl.grant': {
    what: 'What must be true to get in: block access, or require MFA, a compliant device, an approved app, a password change. The operator decides whether all or any one is needed.',
    why: 'This is what the policy enforces. Everything above it only decides when.',
    pitfall: 'Several controls joined with OR when you meant AND. "MFA or a compliant device" lets a stolen password through on a compliant device.',
  },
  'ctrl.session': {
    what: 'Limits on the session after sign-in: how often to sign in again, whether the browser stays signed in, app-enforced restrictions, Defender for Cloud Apps routing.',
    why: 'Shortens how long a stolen session cookie stays useful on devices you do not manage.',
    pitfall: 'Very short sign-in frequency for everyone. People learn to approve every prompt without reading it, which helps MFA-fatigue attacks.',
  },
  'end.terminal': {
    what: 'The outcome: blocked, granted if the controls are met, or allowed with session limits.',
    why: 'Policies do not override each other. Every matching policy applies, and a block in any one of them wins.',
    pitfall: 'Writing an "allow" policy to make an exception. There is none - make the exception with an exclude in the policy that is blocking.',
  },
};
