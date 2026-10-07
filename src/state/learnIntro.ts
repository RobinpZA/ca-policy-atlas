/**
 * Whether this browser has already been pointed at Learn.
 *
 * A per-viewer convenience, so localStorage is the right home. Storage can be blocked
 * (private windows, cleared site data); then the pointer still shows and dismisses,
 * it just comes back next visit.
 */

import { useCallback, useState } from 'react';

export const LEARN_INTRO_KEY = 'ca-atlas.learn-intro-seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(LEARN_INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function useLearnIntro(): { show: boolean; dismiss: () => void } {
  const [seen, setSeen] = useState(readSeen);
  const dismiss = useCallback(() => {
    setSeen(true);
    try {
      localStorage.setItem(LEARN_INTRO_KEY, '1');
    } catch {
      // Storage blocked: dismissed for this session only.
    }
  }, []);
  return { show: !seen, dismiss };
}
