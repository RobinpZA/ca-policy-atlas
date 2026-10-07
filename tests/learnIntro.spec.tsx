// @vitest-environment jsdom
/** The first-visit pointer to Learn: shown once per browser, and never fatal without storage. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { App } from '../src/App.tsx';
import { AppProvider } from '../src/state/appState.tsx';
import { LEARN_INTRO_KEY } from '../src/state/learnIntro.ts';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(): HTMLDivElement {
  window.location.hash = '';
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

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);

beforeEach(() => localStorage.clear());

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe('learn intro', () => {
  it('shows on a first visit and stays gone after Dismiss', () => {
    const el = mount();
    expect(el.querySelector('.notice-intro')).not.toBeNull();
    act(() => button(el, 'Dismiss')!.click());
    expect(el.querySelector('.notice-intro')).toBeNull();
    expect(localStorage.getItem(LEARN_INTRO_KEY)).toBe('1');

    act(() => root?.unmount());
    container?.remove();
    expect(mount().querySelector('.notice-intro')).toBeNull();
  });

  it('opens Learn from the strip and hides it', () => {
    const el = mount();
    act(() => button(el, 'Open Learn')!.click());
    expect(el.querySelector('dialog.learn')?.hasAttribute('open')).toBe(true);
    expect(el.querySelector('.notice-intro')).toBeNull();
  });

  it('counts opening Learn from the header as seen', () => {
    const el = mount();
    act(() => button(el, 'Learn')!.click());
    expect(el.querySelector('.notice-intro')).toBeNull();
    expect(localStorage.getItem(LEARN_INTRO_KEY)).toBe('1');
  });

  it('still shows and dismisses when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const el = mount();
    expect(el.querySelector('.notice-intro')).not.toBeNull();
    act(() => button(el, 'Dismiss')!.click());
    expect(el.querySelector('.notice-intro')).toBeNull();
  });
});
