import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { ClientTotal, ProjectTotal, Report } from "../data/types";

const commands = vi.hoisted(() => ({
  reportByClient: vi.fn(),
  reportByProject: vi.fn(),
  exportReport: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const dialog = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => dialog);

const { Reports } = await import("./reports");

const week = { from: "2026-08-03", to: "2026-08-09" };

function clientReport(
  rows: ClientTotal[],
  overrides: Partial<Report<ClientTotal>> = {},
): Report<ClientTotal> {
  return {
    range: week,
    isoWeek: { year: 2026, week: 32 },
    totalMinutes: rows.reduce((sum, row) => sum + row.totalMinutes, 0),
    rows,
    ...overrides,
  };
}

const acme: ClientTotal = {
  clientId: 1,
  clientName: "Acme",
  totalMinutes: 150,
};

const website: ProjectTotal = {
  projectId: 7,
  projectName: "Website",
  clientId: 1,
  clientName: "Acme",
  totalMinutes: 150,
};

function renderReports(language: "nl" | "en" = "nl") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n(language)}>
        <Reports />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

const type = (labelText: string, value: string) =>
  fireEvent.change(screen.getByLabelText(labelText), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  commands.reportByClient.mockResolvedValue(clientReport([acme]));
  commands.reportByProject.mockResolvedValue({
    ...clientReport([]),
    rows: [website],
    totalMinutes: 150,
  });
  commands.exportReport.mockResolvedValue(undefined);
  dialog.save.mockResolvedValue("C:\\Users\\rens\\uren.xlsx");
});

describe("reading a period back", () => {
  it("opens on this week, grouped by client", async () => {
    renderReports();

    await waitFor(() =>
      expect(commands.reportByClient).toHaveBeenCalledWith({
        preset: "thisWeek",
      }),
    );
    expect(await screen.findByRole("listitem")).toHaveTextContent("Acme");
  });

  it("names the days it covers and the week they are", async () => {
    renderReports();

    expect(await screen.findByText(/augustus/)).toBeInTheDocument();
    expect(screen.getByText(/Week 32/)).toBeInTheDocument();
  });

  it("says nothing about a week when the period is a month", async () => {
    commands.reportByClient.mockResolvedValue(
      clientReport([acme], {
        range: { from: "2026-08-01", to: "2026-08-31" },
        isoWeek: null,
      }),
    );
    renderReports();

    await screen.findByRole("listitem");
    expect(screen.queryByText(/Week /)).toBeNull();
  });

  it("totals the rows without leaving the reader to add them up", async () => {
    commands.reportByClient.mockResolvedValue(
      clientReport([acme, { clientId: 2, clientName: "Other", totalMinutes: 30 }]),
    );
    renderReports();

    expect(await screen.findByText("3:00")).toBeInTheDocument();
  });

  it("asks for another preset by name rather than working out its dates", async () => {
    renderReports();
    await screen.findByRole("listitem");

    click("Vorige maand");

    await waitFor(() =>
      expect(commands.reportByClient).toHaveBeenCalledWith({
        preset: "lastMonth",
      }),
    );
  });

  it("groups by project on request, naming each project's client", async () => {
    renderReports();
    await screen.findByRole("listitem");

    click("Per project");

    await waitFor(() =>
      expect(commands.reportByProject).toHaveBeenCalledWith({
        preset: "thisWeek",
      }),
    );
    const row = await screen.findByRole("listitem");
    expect(row).toHaveTextContent("Website");
    expect(row).toHaveTextContent("Acme");
  });

  it("says so when nothing was booked in the period", async () => {
    commands.reportByClient.mockResolvedValue(clientReport([]));
    renderReports();

    expect(
      await screen.findByText("Geen uren in deze periode."),
    ).toBeInTheDocument();
  });
});

describe("a period picked by hand", () => {
  it("starts from the range already on screen", async () => {
    renderReports();
    await screen.findByRole("listitem");

    click("Aangepast");

    expect(screen.getByLabelText("Van")).toHaveValue("2026-08-03");
    expect(screen.getByLabelText("Tot en met")).toHaveValue("2026-08-09");
  });

  it("asks for exactly the days that were typed", async () => {
    renderReports();
    await screen.findByRole("listitem");
    click("Aangepast");

    type("Van", "2026-06-01");

    await waitFor(() =>
      expect(commands.reportByClient).toHaveBeenCalledWith({
        preset: "custom",
        from: "2026-06-01",
        to: "2026-08-09",
      }),
    );
  });

  it("refuses a range that ends before it starts instead of asking for it", async () => {
    renderReports();
    await screen.findByRole("listitem");
    click("Aangepast");
    commands.reportByClient.mockClear();

    type("Van", "2026-09-01");

    expect(
      await screen.findByText("De einddatum ligt voor de begindatum."),
    ).toBeInTheDocument();
    expect(commands.reportByClient).not.toHaveBeenCalled();
  });
});

describe("exporting to Excel", () => {
  it("asks where to put the file before writing anything", async () => {
    renderReports();
    await screen.findByRole("listitem");

    click("Exporteren naar Excel");

    await waitFor(() => expect(dialog.save).toHaveBeenCalled());
    expect(dialog.save.mock.calls[0][0].defaultPath).toContain("2026-08-03");
    expect(dialog.save.mock.calls[0][0].filters[0].extensions).toEqual(["xlsx"]);
  });

  it("writes the days on screen, with headings in the app's language", async () => {
    // The resolved range, not the preset behind it: asking Rust to work out
    // "this week" again after the dialog has been open would export a
    // different week if midnight passed in between.
    renderReports();
    await screen.findByRole("listitem");

    click("Exporteren naar Excel");

    await waitFor(() =>
      expect(commands.exportReport).toHaveBeenCalledWith(
        "C:\\Users\\rens\\uren.xlsx",
        week,
        expect.objectContaining({ client: "Klant", hours: "Uren" }),
      ),
    );
  });

  it("writes nothing when the dialog is dismissed", async () => {
    dialog.save.mockResolvedValue(null);
    renderReports();
    await screen.findByRole("listitem");

    click("Exporteren naar Excel");

    await waitFor(() => expect(dialog.save).toHaveBeenCalled());
    expect(commands.exportReport).not.toHaveBeenCalled();
  });

  it("says the file was not written rather than looking like it was", async () => {
    commands.exportReport.mockRejectedValue({
      kind: "export",
      message: "Access is denied",
    });
    renderReports();
    await screen.findByRole("listitem");

    click("Exporteren naar Excel");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Het bestand kon niet worden opgeslagen.",
    );
  });
});
