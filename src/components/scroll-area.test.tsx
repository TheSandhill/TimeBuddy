import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrollArea } from "./scroll-area";

/**
 * jsdom lays nothing out, so every metric it reports is zero. The measurements
 * are stated here instead: a 200px viewport over 800px of content, which is the
 * same shape `scroll-geometry.test.ts` does the arithmetic for.
 */
function measured(element: HTMLElement, scrollHeight: number) {
  Object.defineProperty(element, "clientHeight", {
    configurable: true,
    value: 200,
  });
  Object.defineProperty(element, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });

  let scrollTop = 0;
  Object.defineProperty(element, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (next: number) => {
      scrollTop = next;
    },
  });
}

/** The scrolling body, sized, with the thumb measured against it. */
function show(scrollHeight = 800) {
  const view = render(
    <ScrollArea className="p-6">
      <p>a long day</p>
    </ScrollArea>,
  );

  const body = view.container.querySelector("main > div");
  if (!(body instanceof HTMLElement)) {
    throw new Error("the scrolling body is not where its consumers look");
  }

  measured(body, scrollHeight);
  fireEvent.scroll(body);

  return { body, thumb: () => screen.queryByTestId("scroll-thumb") };
}

/** Long enough after the last scroll that the thumb has settled out. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(2_000);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the floating scrollbar", () => {
  it("draws no thumb while the content fits", () => {
    const { thumb } = show(200);
    expect(thumb()).not.toBeInTheDocument();
  });

  it("costs the body no width either way", () => {
    const { body, thumb } = show();

    // Hidden rather than themed, and the thumb is out of flow: the body is
    // exactly as wide with a thumb over it as without one.
    expect(body).toHaveClass("scrollbar-none");
    expect(thumb()).toHaveClass("absolute");
  });

  it("puts the thumb where the scroll position says", () => {
    const { body, thumb } = show();
    expect(thumb()).toHaveStyle({ height: "50px", top: "0px" });

    body.scrollTop = 300;
    fireEvent.scroll(body);
    expect(thumb()).toHaveStyle({ height: "50px", top: "75px" });
  });

  it("is transparent and untouchable at rest", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { thumb } = show();

    expect(thumb()).toHaveClass("opacity-100");

    settle();
    expect(thumb()).toHaveClass("opacity-0");
    expect(thumb()).toHaveClass("pointer-events-none");
  });

  it("comes back when the pointer is over the body", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { body, thumb } = show();
    settle();

    fireEvent.pointerEnter(screen.getByRole("main"));
    expect(thumb()).toHaveClass("opacity-100");
    expect(thumb()).not.toHaveClass("pointer-events-none");

    fireEvent.pointerLeave(screen.getByRole("main"));
    expect(thumb()).toHaveClass("opacity-0");
    expect(body.scrollTop).toBe(0);
  });

  it("fades rather than snaps, on the theme's own tier", () => {
    // The fade is the pleasure, not the message: reduced motion collapses the
    // tier to a millisecond and the thumb still reads (ADR-0004).
    const { thumb } = show();
    expect(thumb()).toHaveClass("transition-opacity", "motion-base");
  });

  it("scrolls the body when the thumb is dragged", () => {
    const { body, thumb } = show();
    const grabbed = thumb();
    if (grabbed === null) {
      throw new Error("nothing to drag");
    }

    fireEvent.pointerDown(grabbed, { clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(grabbed, { clientY: 35, pointerId: 1 });

    // 150px of track carries 600px of content: four times the pointer's travel.
    expect(body.scrollTop).toBe(100);

    fireEvent.pointerUp(grabbed, { clientY: 35, pointerId: 1 });
    fireEvent.pointerMove(grabbed, { clientY: 200, pointerId: 1 });
    expect(body.scrollTop).toBe(100);
  });

  it("keeps the thumb up for the whole of a drag", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { thumb } = show();
    const grabbed = thumb();
    if (grabbed === null) {
      throw new Error("nothing to drag");
    }

    fireEvent.pointerDown(grabbed, { clientY: 10, pointerId: 1 });
    settle();
    expect(thumb()).toHaveClass("opacity-100");

    fireEvent.pointerUp(grabbed, { clientY: 10, pointerId: 1 });
    settle();
    expect(thumb()).toHaveClass("opacity-0");
  });
});
