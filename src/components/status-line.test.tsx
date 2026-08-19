import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusLine } from "./status-line";

/**
 * ADR-0014's rule, held to one place. The point of the component is that the
 * three tones are not three colours — each carries a glyph *and* whether the
 * news interrupts, and those cannot be chosen separately at a call site.
 */
describe("a status line", () => {
  it("announces an answer to something the user pressed", () => {
    render(<StatusLine tone="error">It did not happen.</StatusLine>);

    expect(screen.getByRole("alert")).toHaveTextContent("It did not happen.");
  });

  it("announces the other half of that answer too", () => {
    render(<StatusLine tone="success">It happened.</StatusLine>);

    expect(screen.getByRole("status")).toHaveTextContent("It happened.");
  });

  it("leaves a condition to be read rather than announced", () => {
    // Nobody asked, so nothing is outstanding: a warning that interrupted would
    // be claiming a question was put to the app that never was.
    render(<StatusLine tone="warning">The folder is behind.</StatusLine>);

    expect(screen.getByText("The folder is behind.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the glyph out of the line's name", () => {
    // The words are the message; the glyph repeats them in a shape. A reader
    // hearing both would hear the news twice.
    const { container } = render(
      <StatusLine tone="error">Refused.</StatusLine>,
    );

    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/^Refused\.$/);
  });
});
