import { describe, expect, it } from 'vitest';
import { BASELINES } from '../src/data/loadBaselines.ts';
import { FACET_SPEC_BY_PATH } from '../src/domain/facetSpecs.ts';
import { CHALLENGES, checkChallenge } from '../src/domain/learn/challenges.ts';
import { EMPTY_DRAFT, accepts, draftProblems } from '../src/domain/learn/draft.ts';

describe('challenges', () => {
  it('have unique ids', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });

  for (const c of CHALLENGES) {
    describe(c.id, () => {
      it('targets a baseline that exists', () => {
        expect(BASELINES.byKey.has(c.baseline)).toBe(true);
      });

      it('has a solution the builder can actually place', () => {
        for (const [path, values] of Object.entries(c.solution)) {
          const spec = FACET_SPEC_BY_PATH.get(path);
          expect(spec?.builder, path).toBe(true);
          for (const v of values) expect(accepts(spec!, v), `${path}=${v}`).toBe(true);
        }
      });

      it('solution scores fully met and Entra would save it', () => {
        const draft = { ...EMPTY_DRAFT, slots: c.solution };
        const r = checkChallenge(c, draft);
        expect(r.unmet).toEqual([]);
        expect(r.conflict).toEqual([]);
        expect(r.passed).toBe(true);
        expect(draftProblems(draft)).toEqual([]);
      });

      it('an empty draft does not pass', () => {
        expect(checkChallenge(c, EMPTY_DRAFT).passed).toBe(false);
      });
    });
  }
});
