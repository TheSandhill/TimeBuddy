import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withViewTransition } from "./view-transition";

/**
 * The platform under test is not the one the app ships on. jsdom has no view
 * transitions at all, so the absent case is the default here and the present
 * one has to be stood up — which is itself the first finding: every test in the
 * suite runs the fallback path unless it says otherwise.
 */
function givenViewTransitions(): {
  calls: (() => void)[];
  finish: () => void;
} {
  const calls: (() => void)[] = [];

  const start = vi.fn((update: () => void) => {
    calls.push(update);
    update();
    return {
      finished: Promise.resolve(),
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      skipTransition: () => {},
    };
  });

  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    writable: true,
    value: start,
  });

  return {
    calls,
    finish: () => {
      delete (document as Partial<Document>).startViewTransition;
    },
  };
}

describe("wrapping a state change in a view transition", () => {
  afterEach(() => {
    delete (document as Partial<Document>).startViewTransition;
  });

  it("makes the change even where the platform has none", () => {
    // No `startViewTransition` on the document: jsdom, and any host that is
    // not evergreen Chromium. The change still has to land.
    let open = false;

    withViewTransition(() => {
      open = true;
    });

    expect(open).toBe(true);
  });

  it("hands the change to the platform where there is one", () => {
    const { calls } = givenViewTransitions();
    let open = false;

    withViewTransition(() => {
      open = true;
    });

    expect(calls).toHaveLength(1);
    expect(open).toBe(true);
  });

  it("makes the change exactly once, either way", () => {
    const update = vi.fn();

    withViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);

    givenViewTransitions();
    withViewTransition(update);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("survives a transition the browser abandons", async () => {
    // A second transition starting, a tab going to the background, a duplicate
    // `view-transition-name` — the browser skips the animation and rejects
    // `ready`. The change has already been made by then, so this is noise.
    const abandoned = Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: (update: () => void) => {
        update();
        return {
          finished: Promise.resolve(),
          ready: Promise.reject(new Error("transition skipped")),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => {},
        };
      },
    });
    expect(abandoned).toBeDefined();

    let open = false;
    withViewTransition(() => {
      open = true;
    });

    expect(open).toBe(true);
    await Promise.resolve();
  });
});

/**
 * The claim the whole approach rests on, and the one thing here worth a test
 * against real React: the browser captures the new frame the instant the
 * callback returns, so a state change that has not landed by then is a
 * cross-fade from a frame to itself.
 */
describe("the synchronous update the browser requires", () => {
  afterEach(() => {
    delete (document as Partial<Document>).startViewTransition;
  });

  function Disclosure() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => withViewTransition(() => setOpen(!open))}>
          toggle
        </button>
        {open ? <p>the form</p> : null}
      </>
    );
  }

  it("has the new DOM in place before the callback returns", () => {
    let domWhenCallbackReturned = "";

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      writable: true,
      value: (update: () => void) => {
        update();
        // Where the browser takes its snapshot of the new state.
        domWhenCallbackReturned = document.body.textContent ?? "";
        return {
          finished: Promise.resolve(),
          ready: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => {},
        };
      },
    });

    render(<Disclosure />);
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));

    expect(domWhenCallbackReturned).toContain("the form");
    expect(screen.getByText("the form")).toBeInTheDocument();
  });

  it("still opens where the platform has none", () => {
    render(<Disclosure />);
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));

    expect(screen.getByText("the form")).toBeInTheDocument();
  });
});
