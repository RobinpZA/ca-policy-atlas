import { useMemo, useState, type DragEvent } from 'react';
import { NODE_SPECS } from '../../domain/facetSpecs.ts';
import { resolveToken } from '../../domain/labels.ts';
import { describePolicy } from '../../domain/learn/describe.ts';
import {
  BUILDER_SPECS,
  EMPTY_DRAFT,
  accepts,
  draftProblems,
  draftToPolicy,
  isSingle,
  paletteFor,
  place,
  removeValue,
  type Draft,
} from '../../domain/learn/draft.ts';
import type { FacetSpec, NodeKey, PolicyState } from '../../domain/types.ts';
import { useAppState, useDispatch } from '../../state/appState.tsx';
import { Challenges } from './Challenges.tsx';

/** A palette chip: a value offered by one rank. Slots only take chips from their own rank. */
interface Pick {
  readonly node: NodeKey;
  readonly value: string;
}

const NODES = NODE_SPECS.filter((n) => BUILDER_SPECS.some((s) => s.node === n.key));

const specsOf = (node: NodeKey): readonly FacetSpec[] => BUILDER_SPECS.filter((s) => s.node === node);

/** Every value any slot in this rank takes, once, in palette order. */
function paletteOf(node: NodeKey): readonly { value: string; spec: FacetSpec }[] {
  const seen = new Set<string>();
  const out: { value: string; spec: FacetSpec }[] = [];
  for (const spec of specsOf(node)) {
    for (const value of paletteFor(spec)) {
      const k = value.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ value, spec });
    }
  }
  return out;
}

const PALETTE: ReadonlyMap<NodeKey, ReturnType<typeof paletteOf>> = new Map(
  NODES.map((n) => [n.key, paletteOf(n.key)]),
);

const labelOf = (spec: FacetSpec, value: string): string => resolveToken(value, spec.tokenKind).label;

const fits = (spec: FacetSpec, pick: Pick | null): boolean =>
  !!pick && pick.node === spec.node && accepts(spec, pick.value);

const STATES: readonly { value: PolicyState; label: string }[] = [
  { value: 'reportOnly', label: 'Report-only' },
  { value: 'enabled', label: 'On' },
  { value: 'disabled', label: 'Off' },
];

export function Builder({
  draft,
  setDraft,
  onSent,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  onSent: () => void;
}) {
  const { loaded } = useAppState();
  const dispatch = useDispatch();
  // Click-to-place selection, and the chip being dragged. Same shape, different gesture.
  const [picked, setPicked] = useState<Pick | null>(null);
  const [dragging, setDragging] = useState<Pick | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const active = dragging ?? picked;

  const policy = useMemo(() => draftToPolicy(draft, loaded.length), [draft, loaded.length]);
  const readout = useMemo(() => describePolicy(policy.facets), [policy]);
  const problems = useMemo(() => draftProblems(draft), [draft]);

  function drop(spec: FacetSpec, pick: Pick | null) {
    if (!pick || !fits(spec, pick)) return;
    setDraft(place(draft, spec, pick.value));
    setPicked(null);
  }

  function onDrop(e: DragEvent, spec: FacetSpec) {
    e.preventDefault();
    drop(spec, dragging);
    setDragging(null);
    setOver(null);
  }

  function send() {
    dispatch({ type: 'addLoaded', policies: [policy] });
    dispatch({ type: 'toggle', key: policy.policyKey });
    onSent();
  }

  return (
    <div className="builder">
      <section className="builder-palette" aria-label="Pieces">
        <p className="learn-help">
          Drag a piece onto a slot, or click it and then press <strong>Place</strong>.
        </p>
        {NODES.map((n) => (
          <div key={n.key} className="palette-group">
            <h3 className="eyebrow">{n.title}</h3>
            <div className="chips">
              {PALETTE.get(n.key)!.map(({ value, spec }) => {
                const isPicked = picked?.node === n.key && picked.value === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className="chip piece"
                    draggable
                    aria-pressed={isPicked}
                    onClick={() => setPicked(isPicked ? null : { node: n.key, value })}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', value);
                      e.dataTransfer.effectAllowed = 'copy';
                      setDragging({ node: n.key, value });
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  >
                    {labelOf(spec, value)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="builder-slots" aria-label="Your policy">
        <div className="slot-group">
          <h3 className="eyebrow">Policy</h3>
          <div className="slot-meta">
            <label>
              <span className="slot-label">Name</span>
              <input
                className="learn-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              <span className="slot-label">State</span>
              <select
                className="learn-select"
                value={draft.state}
                onChange={(e) => setDraft({ ...draft, state: e.target.value as PolicyState })}
              >
                {STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {NODES.map((n) => (
          <div key={n.key} className="slot-group">
            <h3 className="eyebrow">{n.title}</h3>
            {specsOf(n.key).map((spec) => {
              const values = draft.slots[spec.path] ?? [];
              const ok = fits(spec, active);
              return (
                <div
                  key={spec.path}
                  className="slot"
                  role="group"
                  aria-label={spec.label}
                  data-polarity={spec.polarity}
                  data-ready={ok || undefined}
                  data-over={(over === spec.path && ok) || undefined}
                  onDragOver={(e) => {
                    if (!fits(spec, dragging)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    if (over !== spec.path) setOver(spec.path);
                  }}
                  onDragLeave={() => setOver((o) => (o === spec.path ? null : o))}
                  onDrop={(e) => onDrop(e, spec)}
                >
                  <span className="slot-label">
                    {spec.label}
                    {isSingle(spec) ? <span className="slot-note"> one value</span> : null}
                  </span>
                  <span className="slot-values">
                    {values.length === 0 ? <span className="slot-empty">empty</span> : null}
                    {values.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className="placed"
                        aria-label={`Remove ${labelOf(spec, v)} from ${spec.label}`}
                        onClick={() => setDraft(removeValue(draft, spec.path, v))}
                      >
                        {labelOf(spec, v)} <span aria-hidden="true">&times;</span>
                      </button>
                    ))}
                  </span>
                  {picked && ok ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => drop(spec, picked)}
                    >
                      Place
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <aside className="builder-side" aria-label="What your policy does">
        <section>
          <h3 className="eyebrow">Reads as</h3>
          <dl className="readout" aria-live="polite">
            {readout.map((l) => (
              <div key={l.node} className="readout-row" data-absent={l.absent}>
                <dt>{l.title}</dt>
                <dd>{l.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="eyebrow">Before Entra will save it</h3>
          {problems.length ? (
            <ul className="problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : (
            <p className="learn-ok">Nothing missing. Entra would accept this.</p>
          )}
        </section>

        <Challenges draft={draft} setDraft={setDraft} />

        <div className="builder-actions">
          <button
            type="button"
            className="btn"
            onClick={send}
            title="Add this draft as a column next to the baselines. It stays in this browser."
          >
            Compare in Atlas
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setDraft(EMPTY_DRAFT)}>
            Start over
          </button>
        </div>
      </aside>
    </div>
  );
}
