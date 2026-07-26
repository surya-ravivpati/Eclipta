import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Tests must be independent: a component left mounted by one test would leak
// into the next and make failures depend on run order.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom implements the DOM but not layout or media queries, so anything that
// reads them needs a stub or components using them throw on render.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }),
});

window.scrollTo = vi.fn();
