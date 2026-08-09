import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

const { commandNames, ...commands } = await import("./commands");
const { isCommandError } = await import("./types");

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const libRs = readFileSync(
  path.join(repoRoot, "src-tauri", "src", "lib.rs"),
  "utf8",
);

/** The command names inside `generate_handler![...]`, module path stripped. */
function registeredInRust(): string[] {
  const [, list] = libRs.match(/generate_handler!\[([^\]]*)\]/s) ?? [];
  expect(list, "no generate_handler! block in lib.rs").toBeDefined();

  return (list as string)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.split("::").pop() as string);
}

describe("ADR-0002: the frontend reaches the database only through commands", () => {
  it("exposes exactly the commands Rust registers", () => {
    expect([...commandNames].sort()).toEqual(registeredInRust().sort());
  });

  it("has a wrapper for every command", () => {
    const invoked = new Set<string>();
    invoke.mockImplementation((name: string) => {
      invoked.add(name);
      return Promise.resolve(null);
    });

    for (const wrapper of Object.values(commands)) {
      if (typeof wrapper === "function") {
        // Arguments don't matter here — only which command name is reached.
        (wrapper as (...args: never[]) => unknown)(
          ...([1, 1, "2026-08-05", 1] as never[]),
        );
      }
    }

    expect([...invoked].sort()).toEqual([...commandNames].sort());
  });
});

describe("command wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
  });

  it("defaults client listing to hiding archived clients", async () => {
    await commands.listClients();

    expect(invoke).toHaveBeenCalledWith("list_clients", {
      includeArchived: false,
    });
  });

  it("sends absent optional text as null rather than undefined", async () => {
    await commands.createClient("Acme");

    expect(invoke).toHaveBeenCalledWith("create_client", {
      name: "Acme",
      notes: null,
    });
  });

  it("sends a report's period by name, for Rust to resolve", async () => {
    await commands.reportByProject({ preset: "lastWeek" });

    expect(invoke).toHaveBeenCalledWith("report_by_project", {
      period: { preset: "lastWeek" },
    });
  });

  it("sends an export as the days it covers, not the preset behind them", async () => {
    await commands.exportReport(
      "C:\\uren.xlsx",
      { from: "2026-08-03", to: "2026-08-09" },
      {
        sheetName: "Uren",
        date: "Datum",
        client: "Klant",
        project: "Project",
        note: "Notitie",
        hours: "Uren",
        total: "Totaal",
      },
    );

    expect(invoke).toHaveBeenCalledWith(
      "export_report",
      expect.objectContaining({ from: "2026-08-03", to: "2026-08-09" }),
    );
  });

  it("sends a new entry as a single payload", async () => {
    await commands.createTimeEntry({
      projectId: 3,
      date: "2026-08-04",
      durationMinutes: 120,
      source: "manual",
    });

    expect(invoke).toHaveBeenCalledWith("create_time_entry", {
      entry: {
        projectId: 3,
        date: "2026-08-04",
        durationMinutes: 120,
        source: "manual",
      },
    });
  });
});

describe("command errors", () => {
  it("recognises the three shapes Rust can reject with", () => {
    expect(isCommandError({ kind: "validation", code: "dateInFuture" })).toBe(
      true,
    );
    expect(isCommandError({ kind: "notFound", entity: "client", id: 1 })).toBe(
      true,
    );
    expect(isCommandError({ kind: "database", message: "locked" })).toBe(true);
  });

  it("rejects anything else, which the UI cannot translate", () => {
    expect(isCommandError(new Error("channel closed"))).toBe(false);
    expect(isCommandError("boom")).toBe(false);
    expect(isCommandError(null)).toBe(false);
    expect(isCommandError({ kind: "something-else" })).toBe(false);
  });
});
