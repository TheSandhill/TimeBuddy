import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import type { Project, TimeEntry } from "../data/types";
import { createI18n } from "../i18n/config";
import { glyphOf, pathsIn } from "../test/glyph";
import { EntryList } from "./entry-list";

const website: Project = {
  id: 7,
  clientId: 1,
  name: "Website",
  hourlyRate: null,
  archivedAt: null,
  createdAt: "2026-08-01T09:00:00Z",
  updatedAt: "2026-08-01T09:00:00Z",
};

const entry: TimeEntry = {
  id: 1,
  projectId: website.id,
  date: "2026-08-05",
  durationMinutes: 60,
  startAt: null,
  endAt: null,
  note: null,
  source: "manual",
  createdAt: "2026-08-05T09:00:00Z",
  updatedAt: "2026-08-05T09:00:00Z",
};

function showRow() {
  render(
    <I18nextProvider i18n={createI18n("nl")}>
      <EntryList
        days={[{ date: "2026-08-05", totalMinutes: 60, entries: [entry] }]}
        projects={[website]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    </I18nextProvider>,
  );
  return {
    edit: screen.getByRole("button", { name: "Website aanpassen" }),
    remove: screen.getByRole("button", { name: "Website verwijderen" }),
  };
}

describe("the two things an hour's row offers", () => {
  it("carries `rename` on Edit, the same glyph the Clients rows use", () => {
    // Same affordance, same set: the Clients rows took it and these did not.
    const { edit } = showRow();

    expect(pathsIn(edit)).toEqual(glyphOf("rename"));
  });

  it("carries `delete` on Delete", () => {
    const { remove } = showRow();

    expect(pathsIn(remove)).toEqual(glyphOf("delete"));
  });

  it("keeps the word beside the glyph, so a row action is still readable", () => {
    const { edit, remove } = showRow();

    expect(edit).toHaveTextContent("Aanpassen");
    expect(remove).toHaveTextContent("Verwijderen");
  });

  it("keeps each button named after the project it acts on", () => {
    // Two rows of identical glyphs otherwise: the label is what says which
    // hour is about to go, and the glyph is silent so it does not blur that.
    const { edit, remove } = showRow();

    expect(edit).toHaveAccessibleName("Website aanpassen");
    expect(remove).toHaveAccessibleName("Website verwijderen");
  });
});
