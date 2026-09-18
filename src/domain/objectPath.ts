/** Dotted-path helpers over plain JSON objects. No dependencies, no prototype tricks. */

import type { RawObject, RawValue } from './types.ts';

export const isPlainObject = (v: unknown): v is RawObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isEmptyObject = (v: unknown): boolean =>
  isPlainObject(v) && Object.keys(v).length === 0;

export function getPath(root: RawObject, path: string): RawValue | undefined {
  let cur: RawValue | undefined = root;
  for (const seg of path.split('.')) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

export function setPath(root: Record<string, RawValue>, path: string, value: RawValue): void {
  const segs = path.split('.');
  const last = segs.pop();
  if (last === undefined) return;
  let cur: Record<string, RawValue> = root;
  for (const seg of segs) {
    const next = cur[seg];
    if (!isPlainObject(next)) {
      const fresh: Record<string, RawValue> = {};
      cur[seg] = fresh;
      cur = fresh;
    } else {
      cur = next as Record<string, RawValue>;
    }
  }
  cur[last] = value;
}

/** Structural clone limited to JSON values, so aliasing never mutates the imported module. */
export function deepClone<T extends RawValue>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => deepClone(x)) as unknown as T;
  if (isPlainObject(v)) {
    const out: Record<string, RawValue> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined) out[k] = deepClone(val);
    }
    return out as unknown as T;
  }
  return v;
}

/**
 * Every leaf path in the object. A leaf is any non-plain-object value, PLUS an empty
 * object - `{}` is a meaningful assertion in this corpus (CAD006's `grantControls`),
 * not an empty branch to recurse past.
 */
export function leafPaths(root: RawObject, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(root)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v) && Object.keys(v).length > 0) {
      out.push(...leafPaths(v, path));
    } else {
      out.push(path);
    }
  }
  return out;
}
