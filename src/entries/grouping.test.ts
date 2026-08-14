import { describe, expect, it } from "vitest";
import type { TimeEntry } from "../data/types";
import { groupByDay, sumMinutes } from "./grouping";

function entry(id: number, date: string, minutes: number): TimeEntry {
  return {
    id,
    projectId: 1,
    date,
    durationMinutes: minutes,
    startAt: null,
    endAt: null,
    note: null,
    source: "manual",
    createdAt: "2026-08-05T09:00:00Z",
    updatedAt: "2026-08-05T09:00:00Z",
  };
}

describe("grouping entries into days", () => {
  it("puts each day's entries under one heading with their total", () => {
    const days = groupByDay([
      entry(1, "2026-08-05", 90),
      entry(2, "2026-08-05", 30),
      entry(3, "2026-08-03", 60),
    ]);

    expect(days).toEqual([
      {
        date: "2026-08-05",
        totalMinutes: 120,
        entries: [entry(1, "2026-08-05", 90), entry(2, "2026-08-05", 30)],
      },
      {
        date: "2026-08-03",
        totalMinutes: 60,
        entries: [entry(3, "2026-08-03", 60)],
      },
    ]);
  });

  it("shows the most recent day first, whatever order it was handed", () => {
    const days = groupByDay([
      entry(1, "2026-08-01", 60),
      entry(2, "2026-08-05", 60),
      entry(3, "2026-08-03", 60),
    ]);

    expect(days.map((day) => day.date)).toEqual([
      "2026-08-05",
      "2026-08-03",
      "2026-08-01",
    ]);
  });

  it("keeps the order entries arrived in within a day", () => {
    const days = groupByDay([
      entry(9, "2026-08-05", 60),
      entry(4, "2026-08-05", 60),
    ]);

    expect(days[0].entries.map((e) => e.id)).toEqual([9, 4]);
  });

  it("has nothing to group when there is nothing", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("totalling a range", () => {
  it("adds up every entry it is given", () => {
    expect(
      sumMinutes([entry(1, "2026-08-05", 90), entry(2, "2026-08-03", 45)]),
    ).toBe(135);
  });

  it("is zero for an empty range, not blank", () => {
    expect(sumMinutes([])).toBe(0);
  });
});
