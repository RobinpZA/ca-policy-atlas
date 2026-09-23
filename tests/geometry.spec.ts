/**
 * Node heights must never be under-estimated.
 *
 * `.pnode` is auto-height, so a node whose measured height exceeds what
 * computeRankLayout allocated does not clip - it grows past its band and renders on top
 * of the rank below. That is invisible to every test that does not do layout, and jsdom
 * does no layout and loads no fonts, so nothing here can catch it by rendering.
 *
 * What it CAN do is pin the arithmetic against ground truth captured from a real browser
 * (Chromium, 1600x1000, fonts loaded, zoom factored out). If someone changes a
 * line-height in flow.css, a font, a size token, or the padding, one of these fails and
 * points at the constant that went stale.
 *
 * Over-estimating is fine and costs a few pixels of whitespace. Under-estimating is the
 * bug. So every assertion here is one-sided, with a ceiling only loose enough to catch
 * someone "fixing" an overlap by padding the constants into uselessness.
 *
 * Re-capture with the overlap/metrics harnesses described in
 * ~/Brain/projects/ca-policy-atlas.md after any deliberate change to the node CSS.
 */

import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { nodeHeight, NODE_W } from '../src/domain/graph/buildGraph.ts';
import { terminalOf } from '../src/domain/graph/terminal.ts';
import type { NodeRow } from '../src/domain/graph/buildGraph.ts';
import type { NormalizedPolicy } from '../src/domain/types.ts';

const get = (key: string): NormalizedPolicy => {
  const p = BASELINES.byKey.get(key);
  if (!p) throw new Error(`missing ${key}`);
  return p;
};

/** Measured in Chromium with the real fonts. head = .pnode[data-kind=head] height. */
const MEASURED_HEAD: ReadonlyArray<readonly [string, number]> = [
  ['VanSurksum~CAP001', 181.4],
  ['VanSurksum~CAP002', 154.4],
  ['VanSurksum~CAD010', 208.4],
  ['VanSurksum~CAL002', 208.4],
  ['VanSurksum~CAD018', 210.8],
  ['VanSurksum~CAD006', 210.8],
  ['VanSurksum~CAD016', 183.9],
  ['Maester~MT.1009', 181.4],
  ['Maester~MT.1011', 156.9],
  ['CISA~MS.AAD.1.1', 154.4],
];

const MEASURED_TERMINAL: ReadonlyArray<readonly [string, number]> = [
  ['VanSurksum~CAP001', 42.4],
  ['VanSurksum~CAD010', 59.9],
  ['VanSurksum~CAD018', 106.7],
  ['VanSurksum~CAD006', 59.9],
  ['Maester~MT.1011', 59.9],
];

describe('head node height', () => {
  it.each(MEASURED_HEAD)('%s is allocated at least its rendered height', (key, measured) => {
    const h = nodeHeight('head', [], undefined, get(key));
    expect(h).toBeGreaterThanOrEqual(measured);
    expect(h).toBeLessThan(measured + 40); // generous, but not a blank cheque
  });

  it('grows with the number of lines the policy name wraps to', () => {
    // CAP002's name is shorter than CAP001's and wraps to one fewer line.
    expect(nodeHeight('head', [], undefined, get('VanSurksum~CAP001'))).toBeGreaterThan(
      nodeHeight('head', [], undefined, get('VanSurksum~CAP002')),
    );
  });
});

describe('terminal node height', () => {
  it.each(MEASURED_TERMINAL)('%s is allocated at least its rendered height', (key, measured) => {
    const policy = get(key);
    const h = nodeHeight('terminal', [], terminalOf(policy.facets), policy);
    expect(h).toBeGreaterThanOrEqual(measured);
    expect(h).toBeLessThan(measured + 40);
  });
});

describe('head node height — eyebrow wrap', () => {
  // No fixture in the shipped corpus exercises this: baseline policies carry a short
  // mnemonic id (CAP001), never a tenant object GUID. The bug only showed up once
  // someone actually loaded a tenant JSON export, whose id IS the GUID.
  const tenant: NormalizedPolicy = {
    source: 'tenant',
    policyKey: 'Tenant~guid-test',
    id: '2cd695a9-06e6-47f3-8d1c-f09241aef799',
    name: 'Device Compliance Policy',
    facets: new Map(),
    anomalies: [],
  };

  it('grows the head when the tenant GUID id wraps the eyebrow onto a second line', () => {
    const withGuid = nodeHeight('head', [], undefined, tenant);
    const withShortId = nodeHeight('head', [], undefined, { ...tenant, id: 't1' });
    expect(withGuid).toBeGreaterThan(withShortId);
  });

  /**
   * The GUID does not merely get pushed off the tag's line - it is WIDER THAN THE BOX and
   * breaks at a hyphen, so it costs two text lines on a flex line of its own.
   *
   * .pnode-eyebrow is the one mono run carrying `letter-spacing: 0.08em`, and CSS applies
   * that advance after the last character too: 36 * (6.6 + 0.88) = 269.3 against a 266
   * content box. Measuring it at the bare 6.6 advance gave 237.6, "fits", and the head
   * rendered 17px past its band - straight on top of the Include-apps node below it.
   *
   * 3 text lines * 17 + 1 gap * 8 = 59, against 1 * 17 for a short id. Delta 42.
   */
  it('counts the GUID breaking inside itself, not just onto the next flex line', () => {
    const withGuid = nodeHeight('head', [], undefined, tenant);
    const withShortId = nodeHeight('head', [], undefined, { ...tenant, id: 't1' });
    expect(withGuid - withShortId).toBe(42);
  });

  /**
   * Ground truth from a real tenant export, derived from the rendered break position
   * (`...-A314-` / `EC688D5D6493`) rather than from a headless measurement, since the
   * harness has no fixture for loaded policies. Heights: 14*2 padding + 2 border +
   * 59 eyebrow + 6 gap + 3*28 title + 6 gap + 2*17 meta.
   */
  const LOADED: ReadonlyArray<readonly [string, string, string, number]> = [
    [
      '674f54f6-0eb5-4ac9-a314-ec688d5d6493',
      'CAD001-O365: Grant macOS access for All users when Modern Auth Clients and Compliant-v1.1',
      'disabled',
      230,
    ],
    [
      '3978775f-495b-4343-9414-44a5b492f041',
      'CAP001-All: Block Legacy Authentication for All users when OtherClients-v1.0',
      'disabled',
      202,
    ],
  ];

  it.each(LOADED)('%s allocates its rendered head height', (id, name, state, expected) => {
    const policy = { ...tenant, id, name, state } as NormalizedPolicy;
    expect(nodeHeight('head', [], undefined, policy)).toBe(expected);
  });
});

describe('facet node height — chip wrap', () => {
  const rowWith = (label: string): NodeRow => ({
    path: 'deviceState.deviceFilter',
    label: 'Device filter',
    polarity: 'value',
    exp: { kind: 'scalar', value: label, key: label.toLowerCase() },
    display: [{ raw: label, label, resolved: true }],
    status: 'single',
  });

  it('grows a facet node when a single chip is too long to fit on one line', () => {
    // A raw device-filter expression has no spaces to break on, so it wraps inside
    // itself via overflow-wrap: anywhere - it does not get held to one line just
    // because it is one unbreakable "word". A height budget that assumed one line
    // rendered shorter than the chip and the node overlapped the rank below.
    const short = nodeHeight('facets', [rowWith('true')], undefined, undefined);
    const long = nodeHeight(
      'facets',
      [rowWith('device.deviceOwnership eq "Company" and device.isCompliant -eq true')],
      undefined,
      undefined,
    );
    expect(long).toBeGreaterThan(short);
  });
});

describe('the geometry contract', () => {
  it('keeps NODE_W in step with the --node-w token', () => {
    // tokens.css carries the same 292 and says so. They are a pair; this is the reminder.
    expect(NODE_W).toBe(292);
  });

  it('never returns a height below the floor for any baseline policy', () => {
    for (const policy of BASELINES.policies) {
      expect(nodeHeight('head', [], undefined, policy)).toBeGreaterThan(60);
      expect(
        nodeHeight('terminal', [], terminalOf(policy.facets), policy),
      ).toBeGreaterThanOrEqual(56);
    }
  });
});
