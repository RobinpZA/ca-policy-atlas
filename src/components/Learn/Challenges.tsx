import { useState } from 'react';
import { BASELINES } from '../../data/loadBaselines.ts';
import { FACET_SPEC_BY_PATH } from '../../domain/facetSpecs.ts';
import { CHALLENGES, checkChallenge, type ChallengeResult } from '../../domain/learn/challenges.ts';
import type { Draft } from '../../domain/learn/draft.ts';

const labelOf = (path: string): string => FACET_SPEC_BY_PATH.get(path)?.label ?? path;

/**
 * Scored with coverage.ts, the Coverage view's own rules. Extra settings are not
 * penalised there, so they are not penalised here either.
 */
export function Challenges({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
  const [id, setId] = useState('');
  // A result is only shown for the draft it was computed from.
  const [result, setResult] = useState<{ draft: Draft; r: ChallengeResult } | null>(null);
  const challenge = CHALLENGES.find((c) => c.id === id);
  const current = result && result.draft === draft ? result.r : null;
  const baseline = challenge ? BASELINES.byKey.get(challenge.baseline) : undefined;

  return (
    <section className="challenge">
      <label className="eyebrow" htmlFor="challenge-pick">
        Challenge
      </label>
      <select
        id="challenge-pick"
        className="learn-select"
        value={id}
        onChange={(e) => {
          setId(e.target.value);
          setResult(null);
        }}
      >
        <option value="">Free build - no challenge</option>
        {CHALLENGES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>

      {challenge ? (
        <>
          <p className="challenge-goal">{challenge.goal}</p>
          <details className="challenge-hint">
            <summary>Hint</summary>
            <p>{challenge.hint}</p>
          </details>
          <div className="builder-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setResult({ draft, r: checkChallenge(challenge, draft) })}
            >
              Check
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setDraft({ ...draft, slots: challenge.solution })}
            >
              Show answer
            </button>
          </div>

          {current ? (
            <div className="challenge-result" role="status">
              {current.passed ? (
                <p className="learn-ok">
                  Passed. Your policy meets every requirement of {baseline?.id} &middot;{' '}
                  {baseline?.name}.
                </p>
              ) : (
                <>
                  <p>
                    {current.met.length} of{' '}
                    {current.met.length + current.unmet.length + current.conflict.length}{' '}
                    requirements met.
                  </p>
                  {current.unmet.length ? (
                    <p>
                      <strong>Still needed:</strong> {current.unmet.map(labelOf).join(', ')}
                    </p>
                  ) : null}
                  {current.conflict.length ? (
                    <p>
                      <strong>Says the opposite:</strong> {current.conflict.map(labelOf).join(', ')}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
