import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import type { Project } from "../data/types";
import { createI18n } from "../i18n/config";
import { glyphOf, pathsIn } from "../test/glyph";
import { EntryForm } from "./entry-form";

const website: Project = {
  id: 7,
  clientId: 1,
  name: "Website",
  hourlyRate: null,
  archivedAt: null,
  createdAt: "2026-08-01T09:00:00Z",
  updatedAt: "2026-08-01T09:00:00Z",
};

function showForm() {
  render(
    <I18nextProvider i18n={createI18n("nl")}>
      <EntryForm
        projects={[website]}
        entry={null}
        today="2026-08-05"
        busy={false}
        error={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    </I18nextProvider>,
  );
  return screen.getByRole("button", { name: "Opslaan" });
}

describe("the button that commits an hour", () => {
  it("carries `save`, the same glyph the name form's submit does", () => {
    // One control, one set: two submit buttons dressed differently is the gap.
    expect(pathsIn(showForm())).toEqual(glyphOf("save"));
  });

  it("keeps the word beside it, so the button still reads as Save", () => {
    expect(showForm()).toHaveAccessibleName("Opslaan");
  });
});
