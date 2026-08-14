import {
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TransientBanner, TransientToast } from "./transient";

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
 * Read up from the news to whatever is animating it. Which element that is, and
 * how deeply it is wrapped, is this module's business and not the test's.
 */
function opacityAbove(node: HTMLElement): string {
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    if (el.style.opacity !== "") {
      return el.style.opacity;
    }
  }
  return "";
}

afterEach(() => {
  root.removeAttribute("style");
});

describe.each([
  ["a banner", TransientBanner],
  ["a toast", TransientToast],
])("%s that arrives and leaves", (_name, Transient) => {
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

    expect(opacityAbove(screen.getByText("the news"))).toBe("0");
    await waitFor(() =>
      expect(opacityAbove(screen.getByText("the news"))).toBe("1"),
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
});

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
