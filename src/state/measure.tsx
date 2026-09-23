/**
 * Rendered node heights, reported back to the board.
 *
 * `nodeHeight()` predicts a node's height from font metrics, and when it under-predicts
 * the node overlaps the rank below - that has happened four separate ways (see the
 * comments in buildGraph.ts). The prediction is still the first pass, and the only one in
 * tests, but once a node is on screen its real height replaces it. Positions stay
 * hand-computed: only the height INPUT to the rank layout changes, so cross-column
 * alignment is exactly as structural as before.
 *
 * This is safe from feedback loops because a node's height depends on its content and
 * the fixed column width, never on the band it was placed in. Moving it cannot resize it.
 */

import { createContext, useContext, useLayoutEffect, type RefObject } from 'react';

type Report = (id: string, height: number) => void;

export const MeasureContext = createContext<Report | null>(null);

/** Report an element's rendered height under a node id, now and whenever it resizes. */
export function useReportHeight(id: string, ref: RefObject<HTMLElement | null>): void {
  const report = useContext(MeasureContext);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !report) return;
    // offsetHeight is layout height, untouched by the canvas zoom transform. Zero means
    // not laid out (jsdom, display:none) - never a real measurement, so never reported.
    const send = () => {
      const h = el.offsetHeight;
      if (h > 0) report(id, h);
    };
    send();
    if (typeof ResizeObserver === 'undefined') return;
    // Catches the late cases a one-off read would miss: web fonts finishing their load,
    // and anything else that reflows the node after first paint.
    const observer = new ResizeObserver(send);
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, report, ref]);
}
