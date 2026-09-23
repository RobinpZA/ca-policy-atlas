/**
 * The export. It must say exactly what the screen says - same statuses, same markers,
 * same three-way split between absent, wildcard and empty - and it must be safe to open
 * in a spreadsheet.
 */

import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { diffSelection } from '../src/domain/diff/diffSelection.ts';
import {
  csvCell,
  exportCsv,
  exportFileName,
  exportMarkdown,
} from '../src/domain/diff/exportDiff.ts';
import { normalizeGraphPolicy } from '../src/domain/adapters/fromGraph.ts';

const get = (key: string) => {
  const p = BASELINES.byKey.get(key);
  if (!p) throw new Error(`missing ${key}`);
  return p;
};

/** Minimal CSV parser, enough to read our own output back. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  return rows;
}

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('plain')).toBe('plain');
  });

  it('defuses cells a spreadsheet would evaluate as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
});

describe('exportCsv', () => {
  const selected = [get('VanSurksum~CAD016'), get('CIS~CIS-5.2.2.4')];
  const diff = diffSelection(selected);
  const rows = parseCsv(exportCsv(selected, diff));

  it('has one row per diffed path plus a header', () => {
    expect(rows).toHaveLength(diff.paths.length + 1);
    expect(rows[0]).toEqual([
      'Rank',
      'Dimension',
      'Why it differs',
      'VanSurksum CAD016',
      'VanSurksum CAD016 - status',
      'CIS CIS-5.2.2.4',
      'CIS CIS-5.2.2.4 - status',
    ]);
  });

  it('writes absence as an empty cell and a wildcard as the marker, never "true"', () => {
    const body = rows.slice(1);
    expect(body.some((r) => r[3] === '' && r[4] === 'not stated')).toBe(true);
    expect(body.flat()).toContain('⟨any⟩');
    expect(body.flat()).not.toContain('true');
  });

  it('carries the same statuses as the diff', () => {
    diff.paths.forEach((path, i) => {
      const entry = diff.byPath.get(path)!;
      const row = rows[i + 1]!;
      expect(row[4] === 'same').toBe(entry.status[0] === 'same');
    });
  });

  it('writes an unresolved GUID in full rather than truncated', () => {
    const cad013 = get('VanSurksum~CAD013');
    const csv = exportCsv([cad013], diffSelection([cad013]));
    expect(csv).toContain('a4f2693f-129c-4b96-982b-2c364b8314d7');
  });

  it('drops the status columns for a single policy - there is nothing to compare', () => {
    const one = [get('VanSurksum~CAD016')];
    expect(parseCsv(exportCsv(one, diffSelection(one)))[0]).toEqual([
      'Rank',
      'Dimension',
      'VanSurksum CAD016',
    ]);
  });
});

describe('exportMarkdown', () => {
  const tenant = normalizeGraphPolicy(
    {
      id: 't1',
      displayName: 'Tenant | pipe',
      state: 'enabled',
      conditions: {
        clientAppTypes: ['all'],
        clientApplications: { includeServicePrincipals: ['x'] },
      },
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    },
    0,
  );
  const selected = [get('VanSurksum~CAD016'), tenant];
  const md = exportMarkdown(selected, diffSelection(selected), new Date('2026-09-22T12:00:00Z'));

  it('leads with the policies and the verdict', () => {
    expect(md).toContain('## Policies');
    expect(md).toContain('## Verdict');
    expect(md).toMatch(/\d+ dimensions, \d+ agree\./);
  });

  it('lists what could not be compared, so the file carries the same caveat as the screen', () => {
    expect(md).toContain('`conditions.clientApplications.includeServicePrincipals`');
  });

  it('escapes pipes so a policy name cannot break the table', () => {
    const tableHeader = md.split('\n').find((l) => l.startsWith('| Rank'))!;
    expect(tableHeader).toContain('Tenant \\| pipe (loaded)');
  });
});

describe('exportFileName', () => {
  it('is timestamped and never carries a policy name', () => {
    expect(exportFileName('csv', new Date(2026, 8, 22, 14, 5))).toBe(
      'ca-policy-atlas-20260922-1405.csv',
    );
  });
});
