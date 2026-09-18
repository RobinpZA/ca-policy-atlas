import { CompareBoard } from './components/Compare/CompareBoard.tsx';
import { DiffTable } from './components/DiffTable/DiffTable.tsx';
import { PolicyPicker } from './components/PolicyPicker/PolicyPicker.tsx';
import { Legend } from './components/ui/Legend.tsx';
import { LoadPolicies } from './components/ui/LoadPolicies.tsx';
import { useAppState, useDispatch } from './state/appState.tsx';

export function App() {
  const state = useAppState();
  const dispatch = useDispatch();
  const single = state.selection.length < 2;

  return (
    <>
      <a className="skip-link" href="#board">
        Skip to comparison
      </a>

      <header className="app-header">
        <h1 className="app-title">
          CA Policy Atlas <span>&mdash; Conditional Access baselines</span>
        </h1>

        <div className="header-spacer" />

        <Legend />

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
        </div>

        <button
          type="button"
          className="btn"
          aria-pressed={state.linked}
          disabled={single}
          onClick={() => dispatch({ type: 'linked', value: !state.linked })}
          title={
            single
              ? 'Linked panning applies once two or more policies are selected'
              : 'Pan and zoom every column together so the rows stay aligned'
          }
        >
          {state.linked ? 'Linked' : 'Unlinked'}
        </button>

        <LoadPolicies />

        {state.selection.length > 0 ? (
          <button type="button" className="btn btn-quiet" onClick={() => dispatch({ type: 'clear' })}>
            Clear
          </button>
        ) : null}
      </header>

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

      <div className="layout">
        <PolicyPicker />
        <main id="board" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {state.view === 'flow' ? <CompareBoard /> : <DiffTable />}
        </main>
      </div>
    </>
  );
}
