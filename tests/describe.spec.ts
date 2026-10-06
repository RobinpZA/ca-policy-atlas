import { describe, expect, it } from 'vitest';
import { extractFacets } from '../src/domain/extractFacets.ts';
import { describePolicy, joinOr } from '../src/domain/learn/describe.ts';
import type { RawObject } from '../src/domain/types.ts';

const read = (pattern: RawObject) => describePolicy(extractFacets(pattern).facets);
const line = (pattern: RawObject, node: string) => read(pattern).find((l) => l.node === node);

describe('describePolicy', () => {
  it('absent, wildcard and empty are three different sentences', () => {
    const absent = line({}, 'cond.platforms')!.text;
    const wildcard = line({ platforms: { includePlatforms: true } }, 'cond.platforms')!.text;
    const empty = line({ platforms: { includePlatforms: [] } }, 'cond.platforms')!.text;
    expect(new Set([absent, wildcard, empty]).size).toBe(3);
    expect(absent).toMatch(/No condition/);
    expect(wildcard).toMatch(/any value you choose/);
    expect(empty).toMatch(/declared, but empty/);
  });

  it('marks absent ranks absent', () => {
    expect(line({}, 'scope.users')).toMatchObject({ absent: true });
    expect(line({ users: { includeUsers: ['All'] } }, 'scope.users')).toMatchObject({
      absent: false,
      text: 'All users',
    });
  });

  it('reads exclusions as exceptions', () => {
    const t = line(
      { users: { includeUsers: ['All'], excludeUsers: ['Break-glass accounts (example)'] } },
      'scope.users',
    )!.text;
    expect(t).toBe('All users except Break-glass accounts (example)');
  });

  it('an exclusion with nothing included says so', () => {
    expect(line({ platforms: { excludePlatforms: ['ios'] } }, 'cond.platforms')!.text).toBe(
      'Nothing included except iOS',
    );
  });

  it('labels the operator and reads the outcome', () => {
    const lines = read({ grantControls: { builtInControls: ['mfa', 'compliantDevice'], operator: 'OR' } });
    expect(lines.find((l) => l.node === 'ctrl.grant')!.text).toMatch(/Operator: any one of/);
    expect(lines.find((l) => l.node === 'end.terminal')!.text).toMatch(
      /^Grant if Require MFA or Require Compliant Device/,
    );
  });

  it('skips ranks the builder does not offer when they are absent', () => {
    expect(line({}, 'cond.authFlows')).toBeUndefined();
    expect(line({}, 'cond.platforms')).toBeDefined();
  });
});

describe('joinOr', () => {
  it('joins naturally', () => {
    expect(joinOr([])).toBe('');
    expect(joinOr(['a'])).toBe('a');
    expect(joinOr(['a', 'b'])).toBe('a or b');
    expect(joinOr(['a', 'b', 'c'])).toBe('a, b or c');
  });
});
