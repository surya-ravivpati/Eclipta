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

// Framer Motion's `whileInView` observes intersections, which jsdom does not
// implement - without this every component using it throws on mount rather
// than simply not animating.
class NoopIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}
vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
