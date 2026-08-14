import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Project, TimeEntry } from "../data/types";
import { UNDO_WINDOW_MS } from "../entries/use-undoable-delete";

const commands = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listTimeEntries: vi.fn(),
  createTimeEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const { Entries } = await import("./entries");

const website: Project = {
  id: 7,
  clientId: 1,
  name: "Website",
  hourlyRate: null,
  archivedAt: null,
  createdAt: "2026-08-01T09:00:00Z",
  updatedAt: "2026-08-01T09:00:00Z",
};

const app: Project = { ...website, id: 8, name: "App" };

function entry(overrides: Partial<TimeEntry> & { id: number }): TimeEntry {
  return {
    projectId: website.id,
    date: "2026-08-05",
    durationMinutes: 60,
    startAt: null,
    endAt: null,
    note: null,
    source: "manual",
    createdAt: "2026-08-05T09:00:00Z",
    updatedAt: "2026-08-05T09:00:00Z",
    ...overrides,
  };
}

function renderEntries(language: "nl" | "en" = "nl") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n(language)}>
        <Entries />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

/** Opens the add form and waits for it. */
async function openForm() {
  fireEvent.click(await screen.findByRole("button", { name: "Uur toevoegen" }));
  return screen.findByRole("form", { name: "Nieuwe registratie" });
}

function type(labelText: string, value: string) {
  fireEvent.change(screen.getByLabelText(labelText), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  commands.listProjects.mockResolvedValue([website, app]);
  commands.listTimeEntries.mockResolvedValue([]);
  commands.createTimeEntry.mockResolvedValue(entry({ id: 1 }));
  commands.updateTimeEntry.mockResolvedValue(entry({ id: 1 }));
  commands.deleteTimeEntry.mockResolvedValue(undefined);
});

describe("reading hours back", () => {
  it("asks for this month so far, up to and including today", async () => {
    vi.setSystemTime(new Date(2026, 7, 9, 12));
    try {
      renderEntries();

      await waitFor(() =>
        expect(commands.listTimeEntries).toHaveBeenCalledWith({
          from: "2026-08-01",
          to: "2026-08-09",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("groups the days and totals each one", async () => {
    commands.listTimeEntries.mockResolvedValue([
      entry({ id: 1, date: "2026-08-05", durationMinutes: 90 }),
      entry({
        id: 2,
        date: "2026-08-05",
        durationMinutes: 30,
        projectId: app.id,
      }),
      entry({ id: 3, date: "2026-08-03", durationMinutes: 45 }),
    ]);
    renderEntries();

    const wednesday = (await screen.findByText(/5 augustus/)).closest("h3");
    expect(wednesday).toHaveTextContent("2:00");

    const monday = screen.getByText(/3 augustus/).closest("h3");
    expect(monday).toHaveTextContent("0:45");

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("totals the whole range as well as each day", async () => {
    commands.listTimeEntries.mockResolvedValue([
      entry({ id: 1, date: "2026-08-05", durationMinutes: 90 }),
      entry({ id: 2, date: "2026-08-03", durationMinutes: 45 }),
    ]);
    renderEntries();

    expect(await screen.findByText("2:15")).toBeInTheDocument();
  });

  it("still names hours whose project has since been archived", async () => {
    // Archiving is not deleting: the hours stay, and so must their names.
    commands.listProjects.mockImplementation(
      ({ includeArchived }: { includeArchived: boolean }) =>
        Promise.resolve(includeArchived ? [website, app] : [website]),
    );
    commands.listTimeEntries.mockResolvedValue([
      entry({ id: 1, projectId: app.id }),
    ]);
    renderEntries();

    expect(await screen.findByRole("listitem")).toHaveTextContent("App");
  });

  it("says so when the range holds nothing", async () => {
    renderEntries();

    expect(
      await screen.findByText("Geen uren in deze periode."),
    ).toBeInTheDocument();
  });

  it("asks again when the range changes", async () => {
    renderEntries();
    await screen.findByText("Geen uren in deze periode.");

    type("Van", "2026-07-01");
    type("Tot en met", "2026-07-31");

    await waitFor(() =>
      expect(commands.listTimeEntries).toHaveBeenCalledWith({
        from: "2026-07-01",
        to: "2026-07-31",
      }),
    );
  });

  it("refuses a range that ends before it starts instead of asking for it", async () => {
    renderEntries();
    await screen.findByText("Geen uren in deze periode.");
    commands.listTimeEntries.mockClear();

    type("Van", "2026-08-20");
    type("Tot en met", "2026-08-01");

    expect(
      await screen.findByText("De einddatum ligt voor de begindatum."),
    ).toBeInTheDocument();
    expect(commands.listTimeEntries).not.toHaveBeenCalled();
  });

  it("shows a timer block's window and a manual entry without one", async () => {
    commands.listTimeEntries.mockResolvedValue([
      entry({
        id: 1,
        durationMinutes: 25,
        source: "timer",
        startAt: new Date(2026, 7, 5, 9, 0).toISOString(),
        endAt: new Date(2026, 7, 5, 9, 25).toISOString(),
      }),
      entry({ id: 2, durationMinutes: 120, note: "Overleg" }),
    ]);
    renderEntries();

    const [block, manual] = await screen.findAllByRole("listitem");
    expect(block).toHaveTextContent("09:00–09:25");
    // No window at all: a manual entry has no start time to show.
    expect(manual).not.toHaveTextContent(/\d{2}:\d{2}–/);
    expect(manual).toHaveTextContent("Overleg");
    expect(manual).toHaveTextContent("2:00");
  });

  it("stops showing a window the duration has been corrected past", async () => {
    // 09:00–09:25 next to "1:30" would be two answers to the same question.
    commands.listTimeEntries.mockResolvedValue([
      entry({
        id: 1,
        durationMinutes: 90,
        source: "timer",
        startAt: new Date(2026, 7, 5, 9, 0).toISOString(),
        endAt: new Date(2026, 7, 5, 9, 25).toISOString(),
      }),
    ]);
    renderEntries();

    const row = await screen.findByRole("listitem");
    expect(row).toHaveTextContent("1:30");
    expect(row).not.toHaveTextContent("09:00");
  });
});

describe("adding hours by hand", () => {
  it("writes a manual entry with no clock times at all", async () => {
    await renderEntries();
    await openForm();

    type("Project", "8");
    type("Datum", "2026-08-04");
    type("Duur", "1,5");
    type("Notitie", "  Kickoff  ");
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    await waitFor(() =>
      expect(commands.createTimeEntry).toHaveBeenCalledWith({
        projectId: 8,
        date: "2026-08-04",
        durationMinutes: 90,
        note: "Kickoff",
        source: "manual",
      }),
    );
  });

  it("takes the duration in whatever form it was typed", async () => {
    for (const [typed, minutes] of [
      ["1:30", 90],
      ["90m", 90],
      ["2", 2],
    ] as const) {
      commands.createTimeEntry.mockClear();
      const { unmount } = renderEntries();
      await openForm();

      type("Duur", typed);
      fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

      await waitFor(() =>
        expect(commands.createTimeEntry).toHaveBeenCalledWith(
          expect.objectContaining({ durationMinutes: minutes }),
        ),
      );
      unmount();
    }
  });

  it("says what it could not read rather than writing something else", async () => {
    renderEntries();
    await openForm();

    type("Duur", "gisteren");
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Onleesbare duur",
    );
    expect(commands.createTimeEntry).not.toHaveBeenCalled();
  });

  it("shows what the database rejected in the user's own language", async () => {
    commands.createTimeEntry.mockRejectedValue({
      kind: "validation",
      code: "dateInFuture",
    });
    renderEntries();
    await openForm();

    type("Duur", "1:00");
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die datum ligt in de toekomst.",
    );
  });
});

describe("correcting an entry", () => {
  it("opens with what the entry already says", async () => {
    commands.listTimeEntries.mockResolvedValue([
      entry({ id: 4, durationMinutes: 90, note: "Overleg", projectId: app.id }),
    ]);
    renderEntries();

    fireEvent.click(await screen.findByRole("button", { name: /aanpassen/ }));

    const form = await screen.findByRole("form", {
      name: "Registratie aanpassen",
    });
    expect(within(form).getByLabelText("Duur")).toHaveValue("1:30");
    expect(within(form).getByLabelText("Project")).toHaveValue("8");
    expect(within(form).getByLabelText("Notitie")).toHaveValue("Overleg");
  });

  it("sends only the parts an entry can be corrected in", async () => {
    commands.listTimeEntries.mockResolvedValue([
      entry({
        id: 4,
        source: "timer",
        startAt: "2026-08-05T09:00:00Z",
        endAt: "2026-08-05T10:00:00Z",
      }),
    ]);
    renderEntries();

    fireEvent.click(await screen.findByRole("button", { name: /aanpassen/ }));
    type("Duur", "0:45");
    fireEvent.click(screen.getByRole("button", { name: "Opslaan" }));

    await waitFor(() =>
      expect(commands.updateTimeEntry).toHaveBeenCalledWith(4, {
        projectId: 7,
        date: "2026-08-05",
        durationMinutes: 45,
        note: null,
      }),
    );
  });
});

describe("deleting an entry behind an undo", () => {
  beforeEach(() => {
    commands.listTimeEntries.mockResolvedValue([
      entry({ id: 4, durationMinutes: 90 }),
    ]);
  });

  it("takes the row off the screen and offers it back", async () => {
    renderEntries();

    fireEvent.click(await screen.findByRole("button", { name: /verwijderen/ }));

    expect(screen.queryByRole("listitem")).toBeNull();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Registratie verwijderd",
    );
  });

  it("restores the row, having never deleted it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderEntries();

      fireEvent.click(
        await screen.findByRole("button", { name: /verwijderen/ }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Ongedaan maken" }));

      expect(await screen.findByRole("listitem")).toHaveTextContent("1:30");
      expect(screen.queryByRole("status")).toBeNull();

      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
      expect(commands.deleteTimeEntry).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes for real once the five seconds are up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderEntries();

      fireEvent.click(
        await screen.findByRole("button", { name: /verwijderen/ }),
      );
      expect(commands.deleteTimeEntry).not.toHaveBeenCalled();

      await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));

      expect(commands.deleteTimeEntry).toHaveBeenCalledWith(4);
      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    } finally {
      vi.useRealTimers();
    }
  });
});
