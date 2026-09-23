import { useId, useRef, useState } from 'react';
import { parsePolicyFile, PolicyParseError } from '../../domain/adapters/fromGraph.ts';
import { uncomparedPaths } from '../../domain/types.ts';
import { useAppState, useDispatch } from '../../state/appState.tsx';

/**
 * Load your own exported Conditional Access policies.
 *
 * Entirely client-side: FileReader only, no upload, no network call of any kind. That
 * is a deliberate guarantee, not an implementation detail - people drop real directory
 * data in here. Loaded policies also stay out of the URL hash, so a shared link can
 * never carry tenant identifiers.
 */
export function LoadPolicies() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useDispatch();
  const { loaded } = useAppState();
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const texts = await Promise.all(Array.from(files).map((f) => f.text()));
      const policies = texts.flatMap((t) => parsePolicyFile(t));
      // Re-key so multiple loads across multiple files never collide.
      const base = loaded.length;
      dispatch({
        type: 'addLoaded',
        policies: policies.map((p, i) => ({ ...p, policyKey: `tenant~${base + i}` })),
      });
      const partial = policies.filter((p) => uncomparedPaths(p).length > 0).length;
      const caveat = partial
        ? ` ${partial} carr${partial === 1 ? 'ies' : 'y'} settings this tool does not model yet - see "not compared" on the column head.`
        : '';
      dispatch({
        type: 'notice',
        value: `Loaded ${policies.length} polic${policies.length === 1 ? 'y' : 'ies'}. They stay in this browser — nothing was uploaded.${caveat}`,
      });
    } catch (err) {
      dispatch({
        type: 'notice',
        value:
          err instanceof PolicyParseError
            ? err.message
            : 'Could not read that file.',
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="header-group">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="application/json,.json"
        multiple
        className="visually-hidden"
        // The button below is the real control; this input is only its file dialog.
        // Left in the a11y tree it is an unlabelled form element and a second tab stop
        // for the same action.
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Load a Conditional Access policy export. Stays in this browser; nothing is uploaded."
      >
        {busy ? 'Reading…' : 'Load JSON'}
      </button>
      {loaded.length > 0 ? (
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => dispatch({ type: 'clearLoaded' })}
          title="Remove all loaded policies from this session"
        >
          Clear {loaded.length}
        </button>
      ) : null}
    </div>
  );
}
