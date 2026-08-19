import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { glyphOf, pathsIn } from "../test/glyph";
import { RootBoundary } from "./root-boundary";

/** A child that fails the way the real ones did: throwing during render. */
function Throws({ message }: { message: string }): never {
  throw new Error(message);
}

beforeEach(() => {
  // React logs every caught error itself. Silenced so a passing suite is quiet,
  // not because the log is unwanted — `componentDidCatch` writes the one that
  // matters, with the component stack.
  vi.spyOn(console, "error").mockImplementation(() => {});
  document.documentElement.lang = "nl";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("when nothing is wrong", () => {
  it("is invisible", () => {
    render(
      <RootBoundary>
        <p>de app zelf</p>
      </RootBoundary>,
    );

    expect(screen.getByText("de app zelf")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("when a render throws", () => {
  const crash = (message = "restoredFrom is not a date") =>
    render(
      <RootBoundary>
        <Throws message={message} />
      </RootBoundary>,
    );

  it("says something instead of showing an empty window", () => {
    // The whole point. Twice this app has answered a render fault with a blank
    // cream rectangle and no way to tell what happened.
    crash();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "TimeBuddy kon dit scherm niet tekenen.",
    );
  });

  it("says the hours are safe, because that is the first question", () => {
    crash();

    expect(screen.getByRole("alert")).toHaveTextContent(/uren zijn veilig/);
  });

  it("carries the error, so the cause is on screen rather than only in a console", () => {
    crash("restoredFrom is not a date");

    expect(screen.getByText("restoredFrom is not a date")).toBeInTheDocument();
  });

  it("offers a reload, and says where quitting lives when that does not help", () => {
    crash();

    expect(
      screen.getByRole("button", { name: "Opnieuw laden" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/systeemvak/);
  });

  it("leaves the window draggable, since its own titlebar is gone", () => {
    // Without decorations and without a titlebar there would be no way to move
    // the window at all. Alt+F4 still reaches Rust, which hides it to the tray.
    const { container } = crash();

    expect(container.querySelector("[data-tauri-drag-region]")).not.toBeNull();
  });

  it("logs the failure with its component stack", () => {
    crash("something specific");

    expect(console.error).toHaveBeenCalledWith(
      "TimeBuddy could not render",
      expect.objectContaining({ message: "something specific" }),
      expect.any(String),
    );
  });

  it("speaks the language the document is in, without needing i18next", () => {
    // It must not depend on the runtime whose failure it may be reporting, so
    // the wording comes from the catalogues as plain JSON.
    document.documentElement.lang = "en";

    crash();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "TimeBuddy could not draw this screen.",
    );
  });
});

describe("the shape a crash wears", () => {
  const crash = () =>
    render(
      <RootBoundary>
        <Throws message="restoredFrom is not a date" />
      </RootBoundary>,
    );

  it("is `error` even though the app initiated it: there is no older screen to fall back to", () => {
    // The fallback test decides between `error` and `warning` (ADR-0014), and a
    // crash has no fallback — the alternative to this screen is a blank window.
    crash();

    expect(pathsIn(screen.getByRole("alert"))).toEqual(glyphOf("error"));
  });
});
