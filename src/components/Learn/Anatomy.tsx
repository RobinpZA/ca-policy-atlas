import { useMemo, useState } from 'react';
import { BASELINES } from '../../data/loadBaselines.ts';
import { NODE_SPECS } from '../../domain/facetSpecs.ts';
import { ANATOMY } from '../../domain/learn/anatomy.ts';
import { CHALLENGES } from '../../domain/learn/challenges.ts';
import { describePolicy } from '../../domain/learn/describe.ts';
import type { NodeKey, NormalizedPolicy } from '../../domain/types.ts';
import { useSelectedPolicies } from '../../state/appState.tsx';

/**
 * Walks the ranks top to bottom, the same order the board uses, and reads one real
 * policy at each rank so the explanation always has an example next to it.
 */
export function Anatomy({ onBuild }: { onBuild: () => void }) {
  const selected = useSelectedPolicies();
  const samples = useMemo(() => {
    const fromChallenges = CHALLENGES.map((c) => BASELINES.byKey.get(c.baseline)).filter(
      (p): p is NormalizedPolicy => !!p,
    );
    const seen = new Set<string>();
    return [...selected, ...fromChallenges].filter((p) =>
      seen.has(p.policyKey) ? false : (seen.add(p.policyKey), true),
    );
  }, [selected]);

  const [rank, setRank] = useState<NodeKey>('policy.head');
  const [sampleKey, setSampleKey] = useState<string>(samples[0]?.policyKey ?? '');
  const sample = samples.find((p) => p.policyKey === sampleKey) ?? samples[0];

  const readout = useMemo(() => (sample ? describePolicy(sample.facets) : []), [sample]);
  const node = NODE_SPECS.find((n) => n.key === rank)!;
  const entry = ANATOMY[rank];
  const line = readout.find((l) => l.node === rank);

  return (
    <div className="anatomy">
      <ol className="anatomy-ranks" aria-label="Parts of a policy">
        {NODE_SPECS.map((n) => (
          <li key={n.key}>
            <button
              type="button"
              className="anatomy-rank"
              aria-current={n.key === rank ? 'step' : undefined}
              onClick={() => setRank(n.key)}
            >
              <span className="anatomy-num">{String(n.rank).padStart(2, '0')}</span>
              {n.title}
            </button>
          </li>
        ))}
      </ol>

      <article className="anatomy-card" aria-live="polite">
        <p className="eyebrow">
          Part {node.rank + 1} of {NODE_SPECS.length}
        </p>
        <h3 className="anatomy-title">{node.title}</h3>
        <dl className="anatomy-facts">
          <dt>What it says</dt>
          <dd>{entry.what}</dd>
          <dt>Why it matters</dt>
          <dd>{entry.why}</dd>
          <dt>Common mistake</dt>
          <dd>{entry.pitfall}</dd>
        </dl>

        {sample ? (
          <section className="anatomy-example">
            <label className="eyebrow" htmlFor="anatomy-sample">
              In a real policy
            </label>
            <select
              id="anatomy-sample"
              className="learn-select"
              value={sample.policyKey}
              onChange={(e) => setSampleKey(e.target.value)}
            >
              {samples.map((p) => (
                <option key={p.policyKey} value={p.policyKey}>
                  {p.id} &middot; {p.name}
                </option>
              ))}
            </select>
            <p className="anatomy-sample-line" data-absent={!line || line.absent}>
              {rank === 'policy.head'
                ? `${sample.name}${sample.state ? ` (${sample.state})` : ''}`
                : line
                  ? line.text
                  : 'This policy says nothing here.'}
            </p>
          </section>
        ) : null}

        <div className="anatomy-nav">
          <button
            type="button"
            className="btn"
            disabled={node.rank === 0}
            onClick={() => setRank(NODE_SPECS[node.rank - 1]!.key)}
          >
            Previous
          </button>
          {node.rank < NODE_SPECS.length - 1 ? (
            <button
              type="button"
              className="btn"
              onClick={() => setRank(NODE_SPECS[node.rank + 1]!.key)}
            >
              Next: {NODE_SPECS[node.rank + 1]!.title}
            </button>
          ) : (
            <button type="button" className="btn" onClick={onBuild}>
              Now build one
            </button>
          )}
        </div>
      </article>
    </div>
  );
}
