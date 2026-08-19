import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Two things WebView2 has and jsdom does not.
 *
 * `ScrollArea` watches its content with a `ResizeObserver` and holds a thumb
 * drag with pointer capture. Stubbing them here rather than guarding every call
 * site keeps the component written for the browser it actually runs in — what a
 * test cannot observe is layout, and layout is exactly what `scroll-geometry`
 * is split out to check without one.
 */
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (Element.prototype.setPointerCapture === undefined) {
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
}

afterEach(() => {
  cleanup();
});
