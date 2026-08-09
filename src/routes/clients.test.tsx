import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Client, Project } from "../data/types";

const commands = vi.hoisted(() => ({
  listClients: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  archiveClient: vi.fn(),
  restoreClient: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  restoreProject: vi.fn(),
}));
vi.mock("../data/commands", () => commands);

const { Clients } = await import("./clients");

const acme: Client = {
  id: 1,
  name: "Acme",
  notes: null,
  archivedAt: null,
  createdAt: "2026-08-01T09:00:00Z",
  updatedAt: "2026-08-01T09:00:00Z",
};

const oldco: Client = {
  ...acme,
  id: 2,
  name: "Oldco",
  archivedAt: "2026-07-01T09:00:00Z",
};

const website: Project = {
  id: 7,
  clientId: acme.id,
  name: "Website",
  hourlyRate: null,
  archivedAt: null,
  createdAt: "2026-08-01T09:00:00Z",
  updatedAt: "2026-08-01T09:00:00Z",
};

const rebrand: Project = {
  ...website,
  id: 8,
  name: "Rebrand",
  archivedAt: "2026-07-01T09:00:00Z",
};

function renderClients() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={createI18n("nl")}>
        <Clients />
      </I18nextProvider>
    </QueryClientProvider>,
  );
}

/** Fills in the one field an add/rename form has and submits it. */
function typeName(form: HTMLElement, value: string) {
  fireEvent.change(within(form).getByLabelText("Naam"), {
    target: { value },
  });
  fireEvent.click(within(form).getByRole("button", { name: "Opslaan" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  commands.listClients.mockResolvedValue([acme]);
  commands.listProjects.mockResolvedValue([website]);
  commands.createClient.mockResolvedValue(acme);
  commands.updateClient.mockResolvedValue(acme);
  commands.archiveClient.mockResolvedValue({ ...acme, archivedAt: "x" });
  commands.restoreClient.mockResolvedValue(acme);
  commands.createProject.mockResolvedValue(website);
  commands.updateProject.mockResolvedValue(website);
  commands.archiveProject.mockResolvedValue({ ...website, archivedAt: "x" });
  commands.restoreProject.mockResolvedValue(website);
});

describe("the master-detail pairing", () => {
  it("asks only for what is live until archived ones are asked for", async () => {
    renderClients();

    await waitFor(() => expect(commands.listClients).toHaveBeenCalledWith(false));
    await waitFor(() =>
      expect(commands.listProjects).toHaveBeenCalledWith({
        clientId: acme.id,
        includeArchived: false,
      }),
    );
  });

  it("selects the first client so the right-hand side is never empty for no reason", async () => {
    commands.listClients.mockResolvedValue([acme, { ...acme, id: 3, name: "Beta" }]);
    renderClients();

    expect(await screen.findByText("Website")).toBeInTheDocument();
    expect(commands.listProjects).toHaveBeenCalledWith({
      clientId: acme.id,
      includeArchived: false,
    });
  });

  it("shows the picked client's projects and nothing else", async () => {
    const beta = { ...acme, id: 3, name: "Beta" };
    commands.listClients.mockResolvedValue([acme, beta]);
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Beta" }));

    await waitFor(() =>
      expect(commands.listProjects).toHaveBeenCalledWith({
        clientId: beta.id,
        includeArchived: false,
      }),
    );
  });

  it("asks for no projects at all when there is no client to ask about", async () => {
    commands.listClients.mockResolvedValue([]);
    renderClients();

    expect(await screen.findByText("Nog geen klanten.")).toBeInTheDocument();
    expect(commands.listProjects).not.toHaveBeenCalled();
  });
});

describe("the show-archived toggle", () => {
  it("asks for archived clients and projects together", async () => {
    renderClients();
    await screen.findByText("Website");

    fireEvent.click(screen.getByLabelText("Toon gearchiveerde"));

    await waitFor(() =>
      expect(commands.listClients).toHaveBeenCalledWith(true),
    );
    await waitFor(() =>
      expect(commands.listProjects).toHaveBeenCalledWith({
        clientId: acme.id,
        includeArchived: true,
      }),
    );
  });

  it("marks an archived row as archived rather than letting it pass for live", async () => {
    commands.listClients.mockResolvedValue([acme, oldco]);
    commands.listProjects.mockResolvedValue([website, rebrand]);
    renderClients();

    fireEvent.click(await screen.findByLabelText("Toon gearchiveerde"));

    const client = (await screen.findByRole("button", { name: "Oldco" })).closest("li");
    expect(client).toHaveTextContent("Gearchiveerd");

    const project = (await screen.findByText("Rebrand")).closest("li");
    expect(project).toHaveTextContent("Gearchiveerd");
    expect(screen.getByText("Website").closest("li")).not.toHaveTextContent(
      "Gearchiveerd",
    );
  });

  it("says why a live project under an archived client is out of the pickers", async () => {
    commands.listClients.mockResolvedValue([oldco]);
    commands.listProjects.mockResolvedValue([{ ...website, clientId: oldco.id }]);
    renderClients();

    fireEvent.click(await screen.findByLabelText("Toon gearchiveerde"));

    const project = (await screen.findByText("Website")).closest("li");
    expect(project).toHaveTextContent("Klant gearchiveerd");
    // Its own way back is still archiving, not restoring: it was never archived.
    expect(
      within(project!).getByRole("button", { name: "Website archiveren" }),
    ).toBeInTheDocument();
  });
});

describe("creating and renaming", () => {
  it("adds a client", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Klant toevoegen" }));
    typeName(await screen.findByRole("form", { name: "Nieuwe klant" }), "Beta");

    await waitFor(() =>
      expect(commands.createClient).toHaveBeenCalledWith("Beta"),
    );
  });

  it("adds a project to the client that is open, at no rate", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Project toevoegen" }));
    typeName(await screen.findByRole("form", { name: "Nieuw project" }), "App");

    await waitFor(() =>
      expect(commands.createProject).toHaveBeenCalledWith(acme.id, "App"),
    );
  });

  it("renames a client without losing the notes it is not asking about", async () => {
    commands.listClients.mockResolvedValue([{ ...acme, notes: "Via Jan" }]);
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Acme hernoemen" }),
    );
    const form = await screen.findByRole("form", { name: "Klant hernoemen" });
    expect(within(form).getByLabelText("Naam")).toHaveValue("Acme");

    typeName(form, "Acme BV");

    await waitFor(() =>
      expect(commands.updateClient).toHaveBeenCalledWith(
        acme.id,
        "Acme BV",
        "Via Jan",
      ),
    );
  });

  it("renames a project without throwing away the rate it has no field for", async () => {
    commands.listProjects.mockResolvedValue([{ ...website, hourlyRate: 92.5 }]);
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Website hernoemen" }),
    );
    typeName(await screen.findByRole("form", { name: "Project hernoemen" }), "Site");

    await waitFor(() =>
      expect(commands.updateProject).toHaveBeenCalledWith(
        website.id,
        "Site",
        92.5,
      ),
    );
  });

  it("says what the command layer rejected, in the user's own language", async () => {
    commands.createClient.mockRejectedValue({
      kind: "validation",
      code: "nameRequired",
    });
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Klant toevoegen" }));
    typeName(await screen.findByRole("form", { name: "Nieuwe klant" }), " ");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Vul een naam in.",
    );
  });
});

describe("archiving, which is the only way out", () => {
  it("offers no way to delete a client or a project", async () => {
    commands.listClients.mockResolvedValue([acme, oldco]);
    commands.listProjects.mockResolvedValue([website, rebrand]);
    renderClients();

    fireEvent.click(await screen.findByLabelText("Toon gearchiveerde"));
    await screen.findByText("Rebrand");

    expect(screen.queryByRole("button", { name: /verwijder/i })).toBeNull();
  });

  it("archives a client and refreshes both columns", async () => {
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Acme archiveren" }),
    );

    await waitFor(() =>
      expect(commands.archiveClient).toHaveBeenCalledWith(acme.id),
    );
  });

  it("archives a project", async () => {
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Website archiveren" }),
    );

    await waitFor(() =>
      expect(commands.archiveProject).toHaveBeenCalledWith(website.id),
    );
  });

  it("offers an archived row back rather than a second archive", async () => {
    commands.listClients.mockResolvedValue([acme, oldco]);
    commands.listProjects.mockResolvedValue([website, rebrand]);
    renderClients();

    fireEvent.click(await screen.findByLabelText("Toon gearchiveerde"));

    fireEvent.click(
      await screen.findByRole("button", { name: "Oldco terugzetten" }),
    );
    await waitFor(() =>
      expect(commands.restoreClient).toHaveBeenCalledWith(oldco.id),
    );
    expect(screen.queryByRole("button", { name: "Oldco archiveren" })).toBeNull();

    fireEvent.click(
      await screen.findByRole("button", { name: "Rebrand terugzetten" }),
    );
    await waitFor(() =>
      expect(commands.restoreProject).toHaveBeenCalledWith(rebrand.id),
    );
  });

  it("says so when archiving is refused instead of pretending it worked", async () => {
    commands.archiveClient.mockRejectedValue({
      kind: "notFound",
      entity: "client",
      id: acme.id,
    });
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Acme archiveren" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dat bestaat niet meer.",
    );
  });
});

describe("nothing in the UI touches the rate", () => {
  it("has no field for hourly rate", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Project toevoegen" }));
    const form = await screen.findByRole("form", { name: "Nieuw project" });

    expect(within(form).queryByLabelText(/tarief/i)).toBeNull();
    expect(within(form).getAllByRole("textbox")).toHaveLength(1);
  });
});
