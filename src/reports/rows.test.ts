import { describe, expect, it } from "vitest";
import type { ClientTotal, ProjectTotal, Report } from "../data/types";
import { clientRows, projectRows } from "./rows";

function report<Row>(rows: Row[]): Report<Row> {
  return {
    range: { from: "2026-08-03", to: "2026-08-09" },
    isoWeek: { year: 2026, week: 32 },
    totalMinutes: 150,
    rows,
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

describe("one shape for both groupings", () => {
  it("names a client row after the client, with nothing above it", () => {
    expect(clientRows(report([acme])).rows).toEqual([
      { key: "client-1", name: "Acme", client: null, totalMinutes: 150 },
    ]);
  });

  it("names a project row after the project, and says whose it is", () => {
    expect(projectRows(report([website])).rows).toEqual([
      { key: "project-7", name: "Website", client: "Acme", totalMinutes: 150 },
    ]);
  });

  it("keeps a client and a project row apart even at the same id", () => {
    // Both rows are id 1 in their own table; one list would collide.
    const keys = [
      ...clientRows(report([acme])).rows,
      ...projectRows(report([{ ...website, projectId: 1 }])).rows,
    ].map((row) => row.key);

    expect(new Set(keys).size).toBe(2);
  });

  it("passes the range and the total through untouched", () => {
    const flattened = clientRows(report([acme]));

    expect(flattened.range).toEqual({ from: "2026-08-03", to: "2026-08-09" });
    expect(flattened.isoWeek).toEqual({ year: 2026, week: 32 });
    expect(flattened.totalMinutes).toBe(150);
  });
});
