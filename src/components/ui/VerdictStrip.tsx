/**
 * The answer before the reading.
 *
 * A six-column board is a lot to take in, and the question being asked of it is nearly
 * always the same one: where do these disagree? This says so in a line, and every hot
 * dimension is a button that lights that rank across every column.
 *
 * It is also the clearest thing in the app that could not be a static page: the counts
 * depend on which of 94 policies happen to be selected, and there are more selections
 * than could ever be pre-rendered.
 */

import { useMemo } from 'react';
import { diffSelection } from '../../domain/diff/diffSelection.ts';
import { summarize } from '../../domain/diff/summarize.ts';
import type { DiffStatus } from '../../domain/diff/compare.ts';
import { useAppState, useDispatch, useSelectedPolicies } from '../../state/appState.tsx';
import { activeRank, useFocus } from '../../state/focus.tsx';
import { ExportButtons } from './ExportButtons.tsx';
import { Legend } from './Legend.tsx';

/** What a status is called when it is the headline rather than a bar width. */
const VERDICT_WORD: Partial<Record<DiffStatus, string>> = {
  conflict: 'conflicts',
  only: 'only in one',
  differs: 'differs',
  'differs/coverage': 'not in every column',
  missing: 'not in every column',
};

export function VerdictStrip() {
  const selected = useSelectedPolicies();
  const focus = useFocus();
  const summary = useMemo(() => summarize(diffSelection(selected)), [selected]);

  const { collapse } = useAppState();
  const dispatch = useDispatch();
  const lit = activeRank(focus);

  // The actions that act on the current selection live beside the verdict about it,
  // not in the header - the header had grown to nine controls and wrapped on a laptop.
  const tail = (
    <div className="verdict-tail">
      <Legend />
      <div className="verdict-actions">
        <button
          type="button"
          className="btn"
          aria-pressed={collapse}
          disabled={selected.length < 2}
          title="Hide every row the selected policies state identically"
          onClick={() => dispatch({ type: 'collapse', value: !collapse })}
        >
          Differences only
        </button>
        <ExportButtons />
      </div>
    </div>
  );

  // Under two columns there is no verdict to give, but the key still applies - the table
  // view uses the same three bar widths - so the strip stays and carries only the tail.
  if (summary.mode === 'single' || selected.length < 2) {
    return <div className="verdict">{tail}</div>;
  }

  return (
    <div className="verdict" role="status">
      <span className="verdict-count">
        <strong>{summary.dimensions}</strong> dimension{summary.dimensions === 1 ? '' : 's'}
      </span>

      <span className="verdict-sep" aria-hidden="true" />

      <span className="verdict-agree">
        <strong>{summary.agree}</strong> agree
      </span>

      {summary.hot.length === 0 ? (
        <span className="verdict-none">
          Every dimension in this selection matches. These policies assert the same thing.
        </span>
      ) : (
        <>
          <span className="verdict-sep" aria-hidden="true" />
          <ul className="verdict-hot">
            {summary.hot.map((dim) => (
              <li key={dim.key}>
                <button
                  type="button"
                  className="verdict-chip"
                  data-status={dim.status}
                  aria-pressed={focus.pinned === dim.key}
                  onClick={() => focus.togglePinned(dim.key)}
                  onPointerEnter={() => focus.setRank(dim.key)}
                  onPointerLeave={() => focus.setRank(null)}
                  onFocus={() => focus.setRank(dim.key)}
                  onBlur={() => focus.setRank(null)}
                >
                  <span className="verdict-bar" aria-hidden="true" />
                  <span className="verdict-chip-title">{dim.title}</span>
                  <span className="verdict-chip-word">{VERDICT_WORD[dim.status] ?? 'differs'}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* The key sits here rather than in the header: it explains the same three bar
          widths the chips above use, so the two belong side by side. */}
      {tail}

      {/* Announced rather than drawn: the highlight itself is visual, and a screen
          reader user gets the same information from the chip they just focused. */}
      <span className="visually-hidden" aria-live="polite">
        {lit ? `Highlighting ${lit} across all columns.` : ''}
      </span>
    </div>
  );
}
