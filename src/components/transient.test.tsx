import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  TransientBanner,
  TransientDisclosure,
  TransientToast,
} from "./transient";

const root = document.documentElement;

/**
 * The tokens a stylesheet would have supplied. Long enough that a departure is
 * observable, which is the whole point of the seam: without them every exit is
 * instant and the assertions below would pass for the wrong reason.
 */
function themeMoves() {
  root.style.setProperty("--motion-quick", "60ms");
  root.style.setProperty("--motion-base", "60ms");
  root.style.setProperty("--motion-bounce", "60ms");
  root.style.setProperty("--ease-out-soft", "cubic-bezier(0.16, 0.84, 0.44, 1)");
  root.style.setProperty("--ease-in-quick", "cubic-bezier(0.4, 0, 1, 1)");
  root.style.setProperty(
    "--ease-bounce-soft",
    "cubic-bezier(0.34, 1.36, 0.64, 1)",
  );
}

/**
 * Read up from the news to whatever is animating it. Which element that is and
 * how deeply it is wrapped is this module's business and not the test's — as is
 * which property carries the arrival, which is why the caller names one.
 */
function styleAbove(node: HTMLElement, property: "height" | "opacity"): string {
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    if (el.style[property] !== "") {
      return el.style[property];
    }
  }
  return "";
}

afterEach(() => {
  root.removeAttribute("style");
});

describe.each([
  ["a banner", TransientBanner, "opacity", "0", "1"],
  ["a toast", TransientToast, "opacity", "0", "1"],
  ["a disclosure", TransientDisclosure, "height", "0px", "auto"],
] as const)(
  "%s that arrives and leaves",
  (_name, Transient, property, shut, open) => {
    it("shows what it is given", () => {
      render(
        <Transient>
          <p>the news</p>
        </Transient>,
      );

      expect(screen.getByText("the news")).toBeInTheDocument();
    });

    it("shows nothing when there is no news", () => {
      render(<Transient>{null}</Transient>);

      expect(screen.queryByText("the news")).not.toBeInTheDocument();
    });

    it("arrives rather than simply being there", async () => {
      themeMoves();
      render(
        <Transient>
          <p>the news</p>
        </Transient>,
      );

      expect(styleAbove(screen.getByText("the news"), property)).toBe(shut);
      await waitFor(() =>
        expect(styleAbove(screen.getByText("the news"), property)).toBe(open),
      );
    });

    it("stays on screen while it leaves, and then goes", async () => {
      themeMoves();
      const { rerender } = render(
        <Transient>
          <p>the news</p>
        </Transient>,
      );

      rerender(<Transient>{null}</Transient>);

      // The condition is already gone; the element is only seeing itself out.
      expect(screen.getByText("the news")).toBeInTheDocument();
      await waitForElementToBeRemoved(() => screen.queryByText("the news"));
    });
  },
);

describe("what is on its way out", () => {
  it("stops being the thing it was the moment it begins to leave", async () => {
    // Undo after the window has closed is a no-op, and a button that quietly
    // does nothing is worse than one that is plainly gone. The exit is a
    // picture of a toast: on screen, but nothing anyone can reach or be told.
    themeMoves();
    const { rerender } = render(
      <TransientToast>
        <div role="status">
          <button type="button">undo</button>
        </div>
      </TransientToast>,
    );
    expect(screen.getByRole("button", { name: "undo" })).toBeInTheDocument();

    rerender(<TransientToast>{null}</TransientToast>);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "undo" })).toBeNull();
    // Still on screen, though — it is leaving rather than gone.
    expect(screen.getByText("undo")).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByText("undo"));
  });
});

/**
 * Which tier a disclosure spends is not among these. jsdom measures every
 * element as zero tall, so a height animation there has no extent and finishes
 * at once whatever duration it was handed — a test of the tier would pass for
 * every tier. The claim lives in `CONTEXT.md` and in the variant beside it.
 */
describe("a disclosure on its way out", () => {
  it("keeps what it was given on screen while the box collapses", async () => {
    // The defect this exists for: the box animated its height while React had
    // already unmounted the form inside it, so what the user watched collapse
    // was blank. The form outlives the condition that opened it.
    themeMoves();
    const { rerender } = render(
      <TransientDisclosure>
        <form aria-label="new client">
          <button type="button">save</button>
        </form>
      </TransientDisclosure>,
    );
    expect(screen.getByRole("form", { name: "new client" })).toBeInTheDocument();

    rerender(<TransientDisclosure>{null}</TransientDisclosure>);

    expect(screen.getByText("save")).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByText("save"));
  });

  it("is out of reach the moment it begins to leave", async () => {
    // A form mid-departure is a picture of a form, the same way a spent toast
    // is a picture of a toast: cancel has already been pressed, and a field
    // that still took focus on the way out would take it from whatever has it.
    themeMoves();
    const { rerender } = render(
      <TransientDisclosure>
        <form aria-label="new client">
          <button type="button">save</button>
        </form>
      </TransientDisclosure>,
    );

    rerender(<TransientDisclosure>{null}</TransientDisclosure>);

    expect(screen.queryByRole("form", { name: "new client" })).toBeNull();
    expect(screen.queryByRole("button", { name: "save" })).toBeNull();
    expect(screen.getByText("save")).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByText("save"));
  });
});
