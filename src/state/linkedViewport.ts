/**
 * Shared viewport across the comparison columns.
 *
 * Every column is its own ReactFlow instance, so panning one has to be mirrored to the
 * rest or the rank alignment - the entire point of the layout - falls apart within two
 * gestures.
 *
 * Two things here are load-bearing:
 *
 * 1. THE DRIVER GUARD. Applying a viewport programmatically makes ReactFlow fire
 *    `onMove` again. Without a record of which instance started the gesture, every
 *    column would echo every other column and they would oscillate.
 *
 * 2. NO fitView. Each instance fitting itself would land them at different zooms and
 *    silently break alignment. Instead the viewport is computed once, deterministically,
 *    from the known layout height, and broadcast. Same input, same pixels, every column.
 */

import type { Viewport } from '@xyflow/react';

type Listener = (v: Viewport, source: string | null) => void;

const listeners = new Set<Listener>();
let current: Viewport = { x: 0, y: 0, zoom: 1 };
let driver: string | null = null;

export const viewportStore = {
  get: (): Viewport => current,

  /** Which column is currently driving a gesture, if any. */
  claim(id: string): void {
    driver = id;
  },
  release(id: string): void {
    if (driver === id) driver = null;
  },
  isDriver: (id: string): boolean => driver === id,

  publish(v: Viewport, source: string | null): void {
    current = v;
    for (const l of listeners) l(v, source);
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * Fit the board deterministically. Called once per layout change, then broadcast - so
 * every column shares one zoom rather than each computing its own.
 */
export function computeFit(totalHeight: number, containerHeight: number): Viewport {
  const padding = 32;
  const usable = Math.max(120, containerHeight - padding * 2);
  const zoom = totalHeight > 0 ? Math.min(1, Math.max(0.35, usable / totalHeight)) : 1;
  return { x: 0, y: padding, zoom };
}
