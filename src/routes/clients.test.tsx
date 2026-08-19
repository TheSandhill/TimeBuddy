import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * Where the motion tokens a stylesheet would have supplied are put. Without one
 * every departure is instant, which is what the rest of these tests want and is
 * useless to the one that watches something leave.
 */
const root = document.documentElement;

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

/** Opens the row-action menu for the named item and clicks an action. */
function menuAction(name: string, action: string) {
  fireEvent.click(
    screen.getByRole("button", { name: `Acties voor ${name}` }),
  );
  fireEvent.click(screen.getByRole("menuitem", { name: action }));
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

afterEach(() => {
  root.removeAttribute("style");
});

describe("the accordion", () => {
  it("shows nothing expanded on arrival", async () => {
    renderClients();

    const row = (await screen.findByRole("button", { name: "Acme" }))
      .closest("[data-client]") as HTMLElement;
    expect(
      within(row).getByRole("button", { name: "Acme" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("reveals a client's projects when opened", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));

    expect(await screen.findByText("Website")).toBeInTheDocument();
    expect(commands.listProjects).toHaveBeenCalledWith({
      includeArchived: false,
    });
  });

  it("has a client's projects before the row is opened to show them", async () => {
    // The body's height is measured on the frame it opens. Fetched on open,
    // the list it measures is empty and the box lands on a height it never
    // animated to — once per row, until the fetch is cached (#80).
    renderClients();
    await screen.findByRole("button", { name: "Acme" });
    await waitFor(() =>
      expect(commands.listProjects).toHaveBeenCalledWith({
        includeArchived: false,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Acme" }));

    expect(screen.getByText("Website")).toBeInTheDocument();
  });

  it("closes the open client when a second is opened", async () => {
    const beta: Client = { ...acme, id: 3, name: "Beta" };
    commands.listClients.mockResolvedValue([acme, beta]);
    commands.listProjects.mockResolvedValue([
      website,
      { ...website, id: 10, name: "Mobile", clientId: beta.id },
    ]);
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Acme" }),
      ).toHaveAttribute("aria-expanded", "false"),
    );
    expect(
      screen.getByRole("button", { name: "Beta" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("picks no client on the user's behalf", async () => {
    commands.listClients.mockResolvedValue([acme, { ...acme, id: 3, name: "Beta" }]);
    renderClients();

    await screen.findByText("Acme");
    for (const name of ["Acme", "Beta"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    }
    expect(screen.queryByText("Website")).toBeNull();
  });

  it("says so when a client has no projects", async () => {
    commands.listProjects.mockResolvedValue([]);
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));

    expect(
      await screen.findByText("Nog geen projecten voor deze klant."),
    ).toBeInTheDocument();
  });

  it("says so when there are no clients at all", async () => {
    commands.listClients.mockResolvedValue([]);
    renderClients();

    expect(await screen.findByText("Nog geen klanten.")).toBeInTheDocument();
  });

  it("offers no row to open before its projects have landed", async () => {
    // The screen has one arrival. A row offered while the Projects are still
    // in flight can be opened onto a body with nothing in it yet — the same
    // empty measurement, moved from once per row to once per screen (#80).
    let land: (projects: Project[]) => void = () => {};
    commands.listProjects.mockReturnValue(
      new Promise<Project[]>((resolve) => {
        land = resolve;
      }),
    );
    renderClients();

    await waitFor(() => expect(commands.listProjects).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Acme" })).toBeNull();
    expect(screen.queryByText("Nog geen klanten.")).toBeNull();

    land([website]);

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    expect(screen.getByText("Website")).toBeInTheDocument();
  });

  it("asks for every project once rather than once per row", async () => {
    // One list, sliced per row. A row asking for its own is what made the
    // first open of each one measure an empty body (#80).
    commands.listClients.mockResolvedValue([acme, { ...acme, id: 3, name: "Beta" }]);
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    expect(commands.listProjects).toHaveBeenCalledTimes(1);
  });
});

describe("the show-archived switch", () => {
  it("asks for archived clients and projects together", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");

    fireEvent.click(screen.getByLabelText("Toon gearchiveerde"));

    await waitFor(() =>
      expect(commands.listClients).toHaveBeenCalledWith(true),
    );
    await waitFor(() =>
      expect(commands.listProjects).toHaveBeenCalledWith({
        includeArchived: true,
      }),
    );
  });

  it("marks an archived client on its own row", async () => {
    commands.listClients.mockResolvedValue([acme, oldco]);
    renderClients();

    fireEvent.click(await screen.findByLabelText("Toon gearchiveerde"));

    const row = (
      await screen.findByRole("button", { name: "Oldco" })
    ).closest("[data-client]");
    expect(row).toHaveTextContent("Gearchiveerd");
  });

  it("gives a project under an archived client no badge of its own", async () => {
    commands.listClients.mockResolvedValue([oldco]);
    commands.listProjects.mockResolvedValue([
      { ...website, clientId: oldco.id },
    ]);
    renderClients();

    fireEvent.click(await screen.findByLabelText("Toon gearchiveerde"));
    fireEvent.click(await screen.findByRole("button", { name: "Oldco" }));

    const row = (await screen.findByText("Website")).closest("li");
    expect(row).not.toHaveTextContent("Gearchiveerd");
    expect(row).not.toHaveTextContent("Klant gearchiveerd");
  });
});

describe("searching", () => {
  it("filters clients by name", async () => {
    const beta: Client = { ...acme, id: 3, name: "Beta" };
    commands.listClients.mockResolvedValue([acme, beta]);
    renderClients();

    await screen.findByText("Acme");
    expect(screen.getByText("Beta")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Zoeken…"), {
      target: { value: "Acm" },
    });

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("includes a client when a project matches", async () => {
    commands.listClients.mockResolvedValue([acme]);
    commands.listProjects.mockResolvedValue([website]);
    renderClients();

    await screen.findByText("Acme");

    fireEvent.change(screen.getByPlaceholderText("Zoeken…"), {
      target: { value: "Website" },
    });

    await waitFor(() =>
      expect(commands.listProjects).toHaveBeenCalledWith({
        includeArchived: false,
      }),
    );
    expect(await screen.findByText("Acme")).toBeInTheDocument();
  });
});

describe("creating and renaming", () => {
  it("adds a client", async () => {
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Klant toevoegen" }),
    );
    typeName(await screen.findByRole("form", { name: "Nieuwe klant" }), "Beta");

    await waitFor(() =>
      expect(commands.createClient).toHaveBeenCalledWith("Beta"),
    );
  });

  it("adds a project to the client that is open, at no rate", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");

    menuAction("Acme", "Project toevoegen aan Acme");
    typeName(await screen.findByRole("form", { name: "Nieuw project" }), "App");

    await waitFor(() =>
      expect(commands.createProject).toHaveBeenCalledWith(acme.id, "App"),
    );
  });

  it("renames a client without losing the notes it is not asking about", async () => {
    commands.listClients.mockResolvedValue([{ ...acme, notes: "Via Jan" }]);
    renderClients();

    await screen.findByRole("button", { name: "Acme" });
    menuAction("Acme", "Acme hernoemen");

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

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");

    menuAction("Website", "Website hernoemen");

    typeName(
      await screen.findByRole("form", { name: "Project hernoemen" }),
      "Site",
    );

    await waitFor(() =>
      expect(commands.updateProject).toHaveBeenCalledWith(
        website.id,
        "Site",
        92.5,
      ),
    );
  });

  it("offers the way in above the list rather than past the end of it", async () => {
    // A hundred Clients is a plausible list and the bottom of one is nowhere:
    // the way to add is where the screen already puts you, beside the search.
    renderClients();
    await screen.findByRole("button", { name: "Acme" });

    const add = screen.getByRole("button", { name: "Klant toevoegen" });
    const list = screen.getByRole("list");

    expect(
      add.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens the Client it is adding to, so the form has somewhere to be", async () => {
    // The menu that offers this sits on the row, which is reachable closed;
    // the form it raises is inside the body, which is not.
    renderClients();
    await screen.findByRole("button", { name: "Acme" });
    expect(screen.getByRole("button", { name: "Acme" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    menuAction("Acme", "Project toevoegen aan Acme");

    expect(
      await screen.findByRole("form", { name: "Nieuw project" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acme" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("does not hand a pending Project to a different Client", async () => {
    // The form belongs to the Client it was raised on. Opening another row is
    // not a way to change its mind about which Client that was — the one thing
    // a form asking only for a name cannot say for itself.
    const beta: Client = { ...acme, id: 3, name: "Beta" };
    commands.listClients.mockResolvedValue([acme, beta]);
    renderClients();
    await screen.findByRole("button", { name: "Acme" });

    menuAction("Acme", "Project toevoegen aan Acme");
    await screen.findByRole("form", { name: "Nieuw project" });

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    expect(screen.queryByRole("form", { name: "Nieuw project" })).toBeNull();
  });

  it("keeps a cancelled form on screen while it collapses", async () => {
    // The box animates its own height, and it used to animate an empty one:
    // React unmounted the form the instant `editing` went null, so closing was
    // 220ms of nothing. The form outlives the condition that opened it.
    root.style.setProperty("--motion-quick", "60ms");
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Klant toevoegen" }),
    );
    const form = await screen.findByRole("form", { name: "Nieuwe klant" });
    fireEvent.click(within(form).getByRole("button", { name: "Annuleren" }));

    // Its own pixels are what the collapsing box has in it. That the departing
    // form is also out of reach is the mechanism's business, and tested there.
    expect(screen.getByText("Annuleren")).toBeInTheDocument();
    await waitForElementToBeRemoved(() => screen.queryByText("Annuleren"));
  });

  it("leaves the accordion alone when a form is cancelled", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");

    menuAction("Acme", "Project toevoegen aan Acme");
    const form = await screen.findByRole("form", { name: "Nieuw project" });
    fireEvent.click(within(form).getByRole("button", { name: "Annuleren" }));

    expect(
      screen.getByRole("button", { name: "Acme" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Website")).toBeInTheDocument();
  });

  it("says what the command layer rejected, in the user's own language", async () => {
    commands.createClient.mockRejectedValue({
      kind: "validation",
      code: "nameRequired",
    });
    renderClients();

    fireEvent.click(
      await screen.findByRole("button", { name: "Klant toevoegen" }),
    );
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
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Rebrand");

    expect(screen.queryByRole("button", { name: /verwijder/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /verwijder/i })).toBeNull();
  });

  it("archives a client and refreshes both queries", async () => {
    renderClients();

    await screen.findByRole("button", { name: "Acme" });
    menuAction("Acme", "Acme archiveren");

    await waitFor(() =>
      expect(commands.archiveClient).toHaveBeenCalledWith(acme.id),
    );
  });

  it("archives a project inside the open client", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");

    menuAction("Website", "Website archiveren");

    await waitFor(() =>
      expect(commands.archiveProject).toHaveBeenCalledWith(website.id),
    );
  });

  it("offers an archived row back rather than a second archive", async () => {
    commands.listClients.mockResolvedValue([acme, oldco]);
    commands.listProjects.mockResolvedValue([website, rebrand]);
    renderClients();

    fireEvent.click(await screen.findByLabelText("Toon gearchiveerde"));
    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Rebrand");

    menuAction("Oldco", "Oldco terugzetten");
    await waitFor(() =>
      expect(commands.restoreClient).toHaveBeenCalledWith(oldco.id),
    );

    menuAction("Rebrand", "Rebrand terugzetten");
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

    await screen.findByRole("button", { name: "Acme" });
    menuAction("Acme", "Acme archiveren");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dat bestaat niet meer.",
    );
  });
});

describe("nothing in the UI touches the rate", () => {
  it("has no field for hourly rate", async () => {
    renderClients();

    fireEvent.click(await screen.findByRole("button", { name: "Acme" }));
    await screen.findByText("Website");

    menuAction("Acme", "Project toevoegen aan Acme");
    const form = await screen.findByRole("form", { name: "Nieuw project" });

    expect(within(form).queryByLabelText(/tarief/i)).toBeNull();
    expect(within(form).getAllByRole("textbox")).toHaveLength(1);
  });
});
