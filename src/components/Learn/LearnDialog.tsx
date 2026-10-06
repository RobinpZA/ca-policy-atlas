import { useEffect, useRef, useState } from 'react';
import { EMPTY_DRAFT, type Draft } from '../../domain/learn/draft.ts';
import { Anatomy } from './Anatomy.tsx';
import { Builder } from './Builder.tsx';

type Tab = 'anatomy' | 'build';

/**
 * The Learn overlay. A native <dialog> opened modally, so Esc-to-close, the focus trap
 * and the inert background come from the browser rather than from code here.
 *
 * Stays mounted while closed: the draft survives closing and reopening, but like a
 * loaded policy it lives only in this tab - never in the URL, never in storage.
 */
export function LearnDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('anatomy');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      // jsdom has no showModal; fall back to plain open so the smoke test can mount it.
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog ref={ref} className="learn" aria-labelledby="learn-title" onClose={onClose}>
      {open ? (
        <div className="learn-shell">
          <header className="learn-head">
            <h2 id="learn-title" className="learn-title">
              Learn <span>&mdash; how a Conditional Access policy is built</span>
            </h2>
            <div className="toggle-group" role="tablist" aria-label="Learn sections">
              <button
                type="button"
                role="tab"
                className="btn"
                aria-selected={tab === 'anatomy'}
                aria-pressed={tab === 'anatomy'}
                onClick={() => setTab('anatomy')}
              >
                Anatomy
              </button>
              <button
                type="button"
                role="tab"
                className="btn"
                aria-selected={tab === 'build'}
                aria-pressed={tab === 'build'}
                onClick={() => setTab('build')}
              >
                Build
              </button>
            </div>
            <div className="header-spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </header>

          <div className="learn-body" role="tabpanel">
            {tab === 'anatomy' ? (
              <Anatomy onBuild={() => setTab('build')} />
            ) : (
              <Builder draft={draft} setDraft={setDraft} onSent={onClose} />
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
