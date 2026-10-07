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
  /** What a policy that leaves this rank out actually does. */
  readonly unset: string;
}

export const ANATOMY: Readonly<Record<NodeKey, AnatomyEntry>> = {
  'policy.head': {
    what: 'The name and state. State is On, Off, or Report-only, which logs what the policy would have done without enforcing it.',
    why: 'Every enabled policy is checked on every sign-in, so a mistake here hits everyone at once. A few days in Report-only gives you sign-in logs showing who would have been blocked or prompted, before anyone actually is.',
    pitfall: 'Switching a new policy straight to On. Run it in Report-only first and read the sign-in logs.',
    unset: 'Unnamed policy.',
  },
  'scope.apps': {
    what: 'Which cloud apps (target resources) the policy covers: all of them, a suite like Office 365, or single apps. Some apps can be excluded.',
    why: 'Apps and users together set the scope. A sign-in outside it is ignored by this policy, whatever the conditions further down say.',
    pitfall: 'Targeting single apps and missing the rest. Most baselines target All apps and narrow with conditions instead.',
    unset: 'No target resources yet. Entra will not save a policy without them.',
  },
  'scope.users': {
    what: 'Who the policy covers: users, groups, directory roles or guests, each with an include and an exclude list.',
    why: 'An exclude wins over an include, even when someone matches both. Most real policies target All users and keep a short exclude list: break-glass accounts, directory sync accounts, a pilot group.',
    pitfall: 'No break-glass exclusion on a block or MFA policy for All users. One misconfiguration then locks every admin out too.',
    unset: 'No users yet. Entra will not save a policy without them.',
  },
  'cond.clientApps': {
    what: 'How the person is signing in: a browser, a modern desktop or mobile app, Exchange ActiveSync, or "other clients" (legacy protocols like POP and IMAP).',
    why: 'POP, IMAP and other legacy protocols send a username and password and nothing else, so MFA never gets to run. They are the main target of password-spray attacks, which is why nearly every baseline blocks "other clients".',
    pitfall: 'Leaving it unset and assuming it only means modern apps. Unset means every client type.',
    unset: 'No client app condition, so it applies to every client, legacy protocols included.',
  },
  'cond.platforms': {
    what: 'The device operating system the sign-in reports: Windows, macOS, iOS, Android, Linux.',
    why: 'Useful when you treat operating systems differently, for example blocking Linux because you do not manage it, or requiring an approved app only on iOS and Android.',
    pitfall: 'The platform is reported by the client and can be spoofed. Use it to scope a policy, not as a security boundary on its own.',
    unset: 'No platform condition, so it applies on every operating system.',
  },
  'cond.deviceState': {
    what: 'A filter on device properties, such as whether it is compliant or which model it is.',
    why: 'One policy can cover personal devices and skip corporate ones, or the reverse, based on properties like join type, compliance or model.',
    pitfall: 'Using a filter where a grant control would do. "Require compliant device" in Grant is usually the clearer way to say it.',
    unset: 'No device filter, so it applies to every device, managed or not.',
  },
  'cond.locations': {
    what: 'Where the sign-in comes from: named IP ranges or countries, with an include and an exclude list.',
    why: 'Most tenants use it to block countries they have no staff in, or to allow admin roles only from known office IPs.',
    pitfall: 'Treating "trusted location" as "no MFA needed". An attacker on your guest Wi-Fi is also on a trusted IP.',
    unset: 'No location condition, so it applies from any network or country.',
  },
  'cond.signInRisk': {
    what: 'How likely Entra ID Protection thinks this one sign-in is not from the account owner: low, medium or high.',
    why: 'Only sign-ins that Entra flags as suspicious get an extra prompt. Everyone else signs in as usual.',
    pitfall: 'Needs Entra ID P2. Without it the condition can be configured but never fires.',
    unset: 'No sign-in risk condition, so it applies whatever risk level the sign-in gets.',
  },
  'cond.userRisk': {
    what: 'How likely Entra ID Protection thinks the account itself is compromised, for example from leaked credentials.',
    why: 'The usual response is to require a secure password change. Once the user completes it with MFA, the risk clears without an admin stepping in.',
    pitfall: 'Blocking high-risk users outright with no self-service path. They stay stuck until an admin dismisses the risk.',
    unset: 'No user risk condition, so it applies whatever risk level the account has.',
  },
  'cond.otherRisk': {
    what: 'Risk signals for insiders, workload identities (service principals) and AI agents.',
    why: 'Brings risk-based controls to signals that user and sign-in risk do not cover: Purview insider risk levels, compromised service principals and agent identities.',
    pitfall: 'These need extra licensing (Insider Risk Management, Workload Identities Premium). Check before relying on them.',
    unset: 'No insider, workload identity or agent risk condition, so those signals play no part.',
  },
  'cond.authFlows': {
    what: 'Special sign-in flows: device code flow (typing a code on another device) and authentication transfer (passing a session from desktop to phone).',
    why: 'Attackers use device code flow for phishing because the victim signs in on the real Microsoft page and the token goes to a device the attacker controls. If nobody in your tenant uses it, block it.',
    pitfall: 'Forgetting that conference-room devices and some CLIs rely on device code flow. Exclude them before you block it.',
    unset: 'No authentication flow condition, so it applies to every flow, device code included.',
  },
  'ctrl.grant': {
    what: 'What must be true to get in: block access, or require MFA, a compliant device, an approved app, a password change. The operator decides whether all or any one is needed.',
    why: 'The rest of the policy decides whether it applies to a sign-in. Grant is the part the user actually sees: an MFA prompt, a block, a request to enrol their device.',
    pitfall: 'Several controls joined with OR when you meant AND. "MFA or a compliant device" lets a stolen password through on a compliant device.',
    unset: 'No grant control.',
  },
  'ctrl.session': {
    what: 'Limits on the session after sign-in: how often to sign in again, whether the browser stays signed in, app-enforced restrictions, Defender for Cloud Apps routing.',
    why: 'Mostly used on unmanaged or shared devices, where you want people signed out sooner and a stolen session cookie to expire quickly.',
    pitfall: 'Very short sign-in frequency for everyone. People learn to approve every prompt without reading it, which helps MFA-fatigue attacks.',
    unset: 'No session controls.',
  },
  'end.terminal': {
    what: 'The outcome: blocked, granted if the controls are met, or allowed with session limits.',
    why: 'There is no priority order between policies. Entra applies every policy that matches, and if any one of them blocks, the sign-in is blocked.',
    pitfall: 'Writing an "allow" policy to make an exception. There is none - make the exception with an exclude in the policy that is blocking.',
    unset: 'No outcome: the policy has no grant or session control.',
  },
};
