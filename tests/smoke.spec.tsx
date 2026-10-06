// @vitest-environment jsdom
/**
 * Mount smoke test.
 *
 * The plan called for no component tests - the React layer is thin and was meant to be
 * eyeballed. It could not be: this environment has no browser automation. So this is the
 * substitute, and it is scoped to the one question eyeballing would have answered
 * cheapest: does the thing actually render, with real data, without throwing?
 *
 * It deliberately does not assert on styling or layout geometry. Those belong to the
 * greyscale and keyboard checks in the README, which still need a human.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../src/App.tsx';
import { AppProvider } from '../src/state/appState.tsx';
import { BASELINES } from '../src/data/loadBaselines.ts';

// React 19 checks this before using act().
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ResizeObserver is required by React Flow and absent from jsdom.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class {
  m22 = 1;
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(hash = ''): HTMLDivElement {
  window.location.hash = hash;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <AppProvider>
        <App />
      </AppProvider>,
    );
  });
  return container;
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('the app mounts', () => {
  it('renders the shell and the full policy list with nothing selected', () => {
    const el = mount();
    expect(el.querySelector('.app-title')?.textContent).toContain('CA Policy Atlas');
    expect(el.querySelectorAll('.policy-row').length).toBe(BASELINES.policies.length);
    expect(el.querySelector('.empty h2')?.textContent).toContain('Nothing selected');
  });

  it('restores a comparison from the URL hash', () => {
    const el = mount('#/c/VanSurksum~CAD016,CISA~MS.AAD.2.1');
    // One head node per policy - the head node IS the column header now.
    expect(el.querySelectorAll('.pnode[data-kind="head"]').length).toBe(2);
    expect(el.querySelectorAll('.pnode[data-col="1"]').length).toBeGreaterThan(0);
  });

  it('drops a pinned rank when the selection changes, rather than dimming the new board', () => {
    const el = mount('#/c/VanSurksum~CAD016,CISA~MS.AAD.2.1,CIS~CIS-5.2.2.4');
    const chip = el.querySelector<HTMLButtonElement>('.verdict-chip');
    expect(chip).not.toBeNull();
    act(() => chip!.click());
    act(() => chip!.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false })));
    expect(el.querySelector('.board')?.hasAttribute('data-focus-rank')).toBe(true);

    // Deselect one column. The pinned rank may not exist on the new board.
    const row = el.querySelector<HTMLButtonElement>('.policy-row[aria-checked="true"]');
    act(() => row!.click());
    expect(el.querySelector('.board')?.hasAttribute('data-focus-rank')).toBe(false);
  });

  it('opens the coverage view from the hash, and asks for an export when nothing is loaded', () => {
    const el = mount('#/c/?v=coverage');
    expect(el.querySelector('button[aria-pressed="true"]')?.textContent).toBe('Coverage');
    expect(el.querySelector('.empty h2')?.textContent).toContain('Nothing loaded');
  });

  it('shows why a row differs in the table, in words', () => {
    const el = mount('#/c/VanSurksum~CAD016,CIS~CIS-5.2.2.4?v=table');
    expect(el.querySelectorAll('.cell-reason').length).toBeGreaterThan(0);
    expect(el.querySelector('table.diff .token')).not.toBeNull();
  });

  it('drops unknown keys from a stale link instead of failing', () => {
    const el = mount('#/c/VanSurksum~CAD016,Nope~DOES-NOT-EXIST');
    expect(el.querySelectorAll('.pnode[data-kind="head"]').length).toBe(1);
    expect(el.querySelector('.notice')?.textContent).toMatch(/no longer exist/);
  });

  it('honours the table view from the hash and renders real diff rows', () => {
    const el = mount('#/c/VanSurksum~CAD016,CIS~CIS-5.2.2.4?v=table');
    const table = el.querySelector('table.diff');
    expect(table).not.toBeNull();

    const headers = [...table!.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers[1]).toContain('CAD016');
    expect(headers[2]).toContain('CIS-5.2.2.4');

    // A dash means "not mentioned", and must actually appear - it is the rendering of
    // absence, which the model keeps distinct from wildcard and from empty.
    expect(table!.textContent).toContain('—');
    // And a wildcard must render as the marker, never as the string "true".
    expect(table!.textContent).toContain('⟨any⟩');
    expect(table!.textContent).not.toMatch(/\btrue\b/);
  });

  it('filters the list by search text', () => {
    const el = mount('#/c/?q=token');
    const rows = [...el.querySelectorAll('.policy-row')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(BASELINES.policies.length);
  });

  // Every one of the 94 policies is already pushed through buildGraph by layout.spec;
  // the render path is uniform, so this samples the shapes that actually differ rather
  // than paying ~200ms of jsdom per policy to re-cover the same code.
  it.each([
    ['VanSurksum~CAD016', 'five apps, platform filter, token protection'],
    ['VanSurksum~CAU004', 'wildcard apps and a negated device state'],
    ['VanSurksum~CAD006', 'grantControls declared but empty'],
    ['VanSurksum~CAD013', 'an application id we cannot name'],
    ['Maester~MT.1011', 'user action, and no control asserted'],
    ['Maester~MT.1003', 'no policyIntent at all'],
    ['CIS~CIS-5.2.2.4', 'aliased session controls and a scalar mode'],
    ['CISA~MS.AAD.2.1', 'risk condition, blocks'],
  ])('renders %s (%s) on its own', (key) => {
    const el = mount(`#/c/${key}?v=table`);
    expect(el.querySelector('table.diff')).not.toBeNull();
    expect(el.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });

  it('renders a six-column comparison, the maximum the picker allows', () => {
    const keys = BASELINES.policies.slice(0, 6).map((p) => p.policyKey);
    const el = mount(`#/c/${keys.join(',')}`);
    expect(el.querySelectorAll('.pnode[data-kind="head"]').length).toBe(6);
    expect(el.querySelectorAll('.gutter-label').length).toBeGreaterThan(0);
    // One band per rank, drawn behind the columns so a rank reads as a row.
    expect(el.querySelectorAll('.rank-band').length).toBe(
      el.querySelectorAll('.gutter-label').length,
    );
  });
});

describe('learn mode', () => {
  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);

  const slot = (el: HTMLElement, label: string) =>
    el.querySelector<HTMLElement>(`.slot[aria-label="${label}"]`)!;

  /** Click-to-place: pick a piece from a palette group, then press Place on the slot. */
  function placePiece(el: HTMLElement, piece: string, slotLabel: string) {
    const chip = [...el.querySelectorAll<HTMLButtonElement>('.piece')].find(
      (b) => b.textContent === piece,
    );
    expect(chip, piece).toBeDefined();
    act(() => chip!.click());
    const place = [...slot(el, slotLabel).querySelectorAll('button')].find(
      (b) => b.textContent === 'Place',
    );
    expect(place, `${piece} -> ${slotLabel}`).toBeDefined();
    act(() => place!.click());
  }

  it('opens on Anatomy and steps through the ranks', () => {
    const el = mount();
    act(() => button(el, 'Learn')!.click());
    expect(el.querySelector('dialog.learn')?.hasAttribute('open')).toBe(true);
    expect(el.querySelector('.anatomy-title')?.textContent).toBe('Policy');
    act(() => button(el, 'Next: Applications')!.click());
    expect(el.querySelector('.anatomy-title')?.textContent).toBe('Applications');
    expect(el.querySelector('.anatomy-sample-line')?.textContent).toBe('All Cloud Apps');
  });

  it('builds a policy by click-to-place, reads it back, and sends it to the board', () => {
    const el = mount('#/c/Maester~MT.1007?v=table');
    act(() => button(el, 'Learn')!.click());
    act(() => button(el, 'Build')!.click());

    placePiece(el, 'All users', 'Include users');
    placePiece(el, 'All Cloud Apps', 'Include apps');
    placePiece(el, 'Require MFA', 'Controls');

    const placed = slot(el, 'Include users').querySelector('.placed');
    expect(placed?.textContent).toContain('All users');
    const readout = el.querySelector('.readout')!.textContent;
    expect(readout).toContain('All users');
    expect(readout).toContain('Grant if Require MFA');
    expect(el.querySelector('.learn-ok')?.textContent).toMatch(/Entra would accept/);

    act(() => button(el, 'Compare in Atlas')!.click());
    expect(el.querySelector('dialog.learn')?.hasAttribute('open')).toBe(false);
    const headers = [...el.querySelectorAll('table.diff thead th')].map((th) => th.textContent);
    expect(headers.some((h) => h?.includes('My draft policy'))).toBe(true);
    // A loaded draft is tenant-like: it must never reach the shareable link.
    expect(window.location.hash).not.toContain('tenant~');
  });

  it('removes a placed piece when it is clicked', () => {
    const el = mount();
    act(() => button(el, 'Learn')!.click());
    act(() => button(el, 'Build')!.click());
    placePiece(el, 'iOS', 'Exclude platforms');
    expect(el.querySelector('.problems')?.textContent).toMatch(/Include platforms/);
    act(() => slot(el, 'Exclude platforms').querySelector<HTMLButtonElement>('.placed')!.click());
    expect(slot(el, 'Exclude platforms').querySelector('.placed')).toBeNull();
  });

  it('scores a challenge with the coverage rules', () => {
    const el = mount();
    act(() => button(el, 'Learn')!.click());
    act(() => button(el, 'Build')!.click());
    const pick = el.querySelector<HTMLSelectElement>('#challenge-pick')!;
    act(() => {
      pick.value = 'legacy-auth';
      pick.dispatchEvent(new Event('change', { bubbles: true }));
    });

    act(() => button(el, 'Check')!.click());
    expect(el.querySelector('.challenge-result')?.textContent).toMatch(/0 of 4 requirements met/);

    act(() => button(el, 'Show answer')!.click());
    act(() => button(el, 'Check')!.click());
    expect(el.querySelector('.challenge-result')?.textContent).toMatch(/Passed/);
  });
});
