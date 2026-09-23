/**
 * Cross-column rank focus.
 *
 * Hovering or focusing one node lights that rank in EVERY column and dims the rest, so
 * "how do these six baselines differ on Locations?" becomes one gesture instead of six
 * separate reads. It is the interaction the side-by-side layout was built for.
 *
 * WHY THIS IS A CONTEXT AND NOT NODE DATA. React Flow rebuilds its internal node store
 * whenever the `nodes` array identity changes. Threading a hover value through
 * `node.data` would rebuild every node in the board on every pointer move - hundreds of
 * objects per second for a purely visual state. Instead the value lives here and the
 * highlight itself is CSS keyed off a data attribute on the board.
 *
 * WHY TWO CONTEXTS. The nodes only WRITE focus. Reading the combined value would
 * re-render every node on every hover change, which is the cost the paragraph above
 * exists to avoid - so the setters sit in their own context, whose value never changes.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { NodeKey } from '../domain/types.ts';
import { useAppState } from './appState.tsx';

interface FocusActions {
  readonly setRank: (rank: NodeKey | null) => void;
  readonly togglePinned: (rank: NodeKey) => void;
}

interface FocusValue extends FocusActions {
  readonly rank: NodeKey | null;
  /** Pinned by the verdict strip; survives the pointer leaving the board. */
  readonly pinned: NodeKey | null;
}

const FocusContext = createContext<FocusValue | null>(null);
const FocusActionsContext = createContext<FocusActions | null>(null);

export function FocusProvider({ children }: { children: ReactNode }) {
  const [rank, setRank] = useState<NodeKey | null>(null);
  const [pinned, setPinned] = useState<NodeKey | null>(null);

  // A new selection is a new board. A pin or hover from the old one may name a rank the
  // new board does not have, which dims every node and lights none. The hover case is
  // real too: a node unmounted under the pointer never fires mouseleave.
  const { selection } = useAppState();
  const [focusScope, setFocusScope] = useState(selection);
  if (focusScope !== selection) {
    setFocusScope(selection);
    setRank(null);
    setPinned(null);
  }

  const togglePinned = useCallback(
    (next: NodeKey) => setPinned((prev) => (prev === next ? null : next)),
    [],
  );

  const actions = useMemo<FocusActions>(() => ({ setRank, togglePinned }), [togglePinned]);

  const value = useMemo<FocusValue>(() => ({ rank, pinned, ...actions }), [rank, pinned, actions]);

  return (
    <FocusActionsContext.Provider value={actions}>
      <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
    </FocusActionsContext.Provider>
  );
}

export function useFocus(): FocusValue {
  const value = useContext(FocusContext);
  if (!value) throw new Error('useFocus must be used inside a FocusProvider');
  return value;
}

/** Setters only. Stable for the provider's lifetime, so a caller never re-renders on focus. */
export function useFocusActions(): FocusActions {
  const value = useContext(FocusActionsContext);
  if (!value) throw new Error('useFocusActions must be used inside a FocusProvider');
  return value;
}

/** The rank actually lit: a hover wins over a pin, so the board still follows the pointer. */
export const activeRank = (focus: FocusValue): NodeKey | null => focus.rank ?? focus.pinned;
