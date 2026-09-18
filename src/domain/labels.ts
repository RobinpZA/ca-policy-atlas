/**
 * Raw policy values -> human labels.
 *
 * The application-id map and the grant-control strings are ported from
 * CA-BaselineAuditor/Private/Format-PolicyDisplay.ps1 so the two tools describe the
 * same policy the same way.
 *
 * Rule for identifiers we cannot resolve: show the raw value, truncated, in mono, and
 * mark it `resolved: false`. Never invent a friendly name. A reader can tell that
 * `0af06dc6...` is an app they need to look up; they cannot tell that a plausible-looking
 * invented name is wrong.
 */

import appIdsRaw from '../../config/app-ids.json';
import type { DisplayToken, Expectation, TokenKind } from './types.ts';
import { isValued } from './types.ts';

const APP_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(appIdsRaw as Record<string, string>).filter(([k]) => !k.startsWith('$')),
);

/** Case-insensitive lookup - the corpus mixes "All" and "all". */
const APP_IDS_LOWER: ReadonlyMap<string, string> = new Map(
  Object.entries(APP_IDS).map(([k, v]) => [k.toLowerCase(), v]),
);

const USER_ACTIONS: Record<string, string> = {
  'urn:user:registersecurityinfo': 'Register security info',
  'urn:user:registerdevice': 'Register or join device',
};

const IDENTITIES: Record<string, string> = {
  all: 'All users',
  none: 'No users',
  guestsorexternalusers: 'Guests / external users',
};

const CLIENT_APP_TYPES: Record<string, string> = {
  all: 'All client apps',
  browser: 'Browser',
  mobileappsanddesktopclients: 'Mobile and desktop apps',
  exchangeactivesync: 'Exchange ActiveSync',
  eassupported: 'Exchange ActiveSync (supported)',
  other: 'Other clients (legacy auth)',
};

const PLATFORMS: Record<string, string> = {
  all: 'All platforms',
  android: 'Android',
  ios: 'iOS',
  windows: 'Windows',
  windowsphone: 'Windows Phone',
  macos: 'macOS',
  linux: 'Linux',
};

const LOCATIONS: Record<string, string> = {
  all: 'All locations',
  alltrusted: 'All trusted locations',
  '00000000-0000-0000-0000-000000000000': 'MFA trusted IPs',
};

const RISK_LEVELS: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
  hidden: 'Hidden',
  unknownfuturevalue: 'Unknown (future value)',
};

const AUTH_FLOWS: Record<string, string> = {
  devicecodeflow: 'Device code flow',
  authenticationtransfer: 'Authentication transfer',
};

/** Ported verbatim from Format-GrantControls in Format-PolicyDisplay.ps1. */
const GRANT_CONTROLS: Record<string, string> = {
  mfa: 'Require MFA',
  block: 'Block Access',
  compliantdevice: 'Require Compliant Device',
  domainjoineddevice: 'Require Hybrid Azure AD Join',
  approvedapplication: 'Require Approved App',
  compliantapplication: 'Require App Protection Policy',
  passwordchange: 'Require Password Change',
  unknownfuturevalue: 'Unknown (future value)',
};

const AUTH_STRENGTHS: Record<string, string> = {
  mfa: 'Multifactor authentication',
  passwordlessmfa: 'Passwordless MFA',
  phishingresistant: 'Phishing-resistant MFA',
};

const OPERATORS: Record<string, string> = {
  or: 'any one of',
  and: 'all of',
};

const PERSISTENT_BROWSER_MODES: Record<string, string> = {
  never: 'Never persistent',
  always: 'Always persistent',
};

const SESSION_CONTROL_VALUES: Record<string, string> = {
  blockdownloads: 'Block downloads',
  mcasconfigured: 'Use custom MDCA policy',
  monitoronly: 'Monitor only',
  strict: 'Strict',
  disabled: 'Disabled',
  unknownfuturevalue: 'Unknown (future value)',
};

const LOOKUPS: Partial<Record<TokenKind, Record<string, string>>> = {
  userAction: USER_ACTIONS,
  identity: IDENTITIES,
  clientAppType: CLIENT_APP_TYPES,
  platform: PLATFORMS,
  location: LOCATIONS,
  riskLevel: RISK_LEVELS,
  authFlow: AUTH_FLOWS,
  grantControl: GRANT_CONTROLS,
  authStrength: AUTH_STRENGTHS,
  operator: OPERATORS,
  persistentBrowserMode: PERSISTENT_BROWSER_MODES,
  sessionControl: SESSION_CONTROL_VALUES,
};

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isGuid = (v: string): boolean => GUID_RE.test(v);

/** `0af06dc6-e4b5-...` -> `0af06dc6…`. Full value stays available on hover and copy. */
export const truncateGuid = (v: string): string => (isGuid(v) ? `${v.slice(0, 8)}…` : v);

/** Resolve one raw value for a given token kind. */
export function resolveToken(raw: string, kind: TokenKind): DisplayToken {
  const lower = raw.toLowerCase();

  if (kind === 'appId') {
    const hit = APP_IDS_LOWER.get(lower);
    if (hit) return { raw, label: hit, resolved: true };
    return { raw, label: truncateGuid(raw), resolved: !isGuid(raw) };
  }

  if (kind === 'bool') {
    return { raw, label: raw === 'true' ? 'Required' : 'Not required', resolved: true };
  }

  const table = LOOKUPS[kind];
  const hit = table?.[lower];
  if (hit) return { raw, label: hit, resolved: true };

  // Identities and locations are frequently tenant GUIDs with no global meaning.
  if (kind === 'identity' || kind === 'location') {
    return { raw, label: truncateGuid(raw), resolved: !isGuid(raw) };
  }

  // Unknown value of a known kind: show it as written. It is a real value, just one we
  // have no nicer name for, so it counts as resolved.
  return { raw, label: raw, resolved: true };
}

/**
 * Marker expectations (wildcard / negated / empty) carry no value tokens - the node
 * renderer draws those states itself, and must never print the literal string "true".
 */
export function resolveTokens(exp: Expectation, kind: TokenKind): readonly DisplayToken[] {
  if (!isValued(exp)) return [];
  const values = exp.kind === 'set' ? exp.values : [exp.value];
  return values.map((v) => resolveToken(v, kind));
}

/** Every application identifier this build knows how to name. Used by the verify script. */
export const knownAppIds = (): readonly string[] => Object.keys(APP_IDS);
