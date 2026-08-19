import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { glyphOf, pathsIn } from "../test/glyph";
import { FormError } from "./form-error";

describe("the line a form says when it was refused", () => {
  it("says nothing at all when there is nothing to say", () => {
    const { container } = render(<FormError message={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("announces the refusal, because one nobody is told about did not happen", () => {
    render(<FormError message="Deze naam bestaat al" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Deze naam bestaat al");
  });

  it("wears `error`: the user pressed submit and it did not happen", () => {
    render(<FormError message="Deze naam bestaat al" />);

    expect(pathsIn(screen.getByRole("alert"))).toEqual(glyphOf("error"));
  });
});
