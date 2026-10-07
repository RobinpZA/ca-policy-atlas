import { CompareBoard } from './components/Compare/CompareBoard.tsx';
import { CoverageView } from './components/Coverage/CoverageView.tsx';
import { DiffTable } from './components/DiffTable/DiffTable.tsx';
import { LearnDialog } from './components/Learn/LearnDialog.tsx';
import { PolicyPicker } from './components/PolicyPicker/PolicyPicker.tsx';
import { LearnIntro } from './components/ui/LearnIntro.tsx';
import { VerdictStrip } from './components/ui/VerdictStrip.tsx';
import { useState } from 'react';
import { useAppState, useDispatch } from './state/appState.tsx';
import { FocusProvider } from './state/focus.tsx';
import { useLearnIntro } from './state/learnIntro.ts';

export function App() {
  const state = useAppState();
  const dispatch = useDispatch();
  const [learning, setLearning] = useState(false);
  const intro = useLearnIntro();
  const openLearn = () => {
    intro.dismiss();
    setLearning(true);
  };

  return (
    <FocusProvider>
      <a className="skip-link" href="#board">
        Skip to comparison
      </a>

      <header className="app-header">
        <h1 className="app-title">
          CA Policy Atlas <span>&mdash; learn, compare and check Conditional Access policies</span>
        </h1>
        <span className="app-version">v{__APP_VERSION__}</span>

        <div className="header-spacer" />

        <button
          type="button"
          className="btn"
          aria-haspopup="dialog"
          title="How a Conditional Access policy is built, and a place to build one"
          onClick={openLearn}
        >
          Learn
        </button>

        <div className="toggle-group" role="group" aria-label="View">
          <button
            type="button"
            className="btn"
            aria-pressed={state.view === 'flow'}
            onClick={() => dispatch({ type: 'view', value: 'flow' })}
          >
            Flow
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={state.view === 'table'}
            onClick={() => dispatch({ type: 'view', value: 'table' })}
          >
            Table
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={state.view === 'coverage'}
            title="How well your loaded policies cover a baseline"
            onClick={() => dispatch({ type: 'view', value: 'coverage' })}
          >
            Coverage
          </button>
        </div>
      </header>

      <VerdictStrip />

      {state.notice ? (
        <div className="notice" role="status">
          <span>{state.notice}</span>
          <button
            type="button"
            className="btn btn-quiet"
            style={{ marginLeft: 'auto', height: 24 }}
            onClick={() => dispatch({ type: 'notice', value: null })}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {intro.show ? <LearnIntro onOpen={openLearn} onDismiss={intro.dismiss} /> : null}

      <div className="layout">
        <PolicyPicker />
        <main
          id="board"
          style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}
        >
          {state.view === 'flow' ? (
            <CompareBoard />
          ) : state.view === 'table' ? (
            <DiffTable />
          ) : (
            <CoverageView />
          )}
        </main>
      </div>

      <LearnDialog open={learning} onClose={() => setLearning(false)} />
    </FocusProvider>
  );
}
