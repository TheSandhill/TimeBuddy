import { describe, expect, it } from "vitest";
import type { TimeEntry } from "../data/types";
import { windowOf } from "./window";

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 1,
    projectId: 1,
    date: "2026-08-05",
    durationMinutes: 25,
    startAt: "2026-08-05T09:00:00Z",
    endAt: "2026-08-05T09:25:00Z",
    note: null,
    source: "timer",
    createdAt: "2026-08-05T09:25:00Z",
    updatedAt: "2026-08-05T09:25:00Z",
    ...overrides,
  };
}

describe("the window a timer entry ran in", () => {
  it("is the block's own start and end", () => {
    expect(windowOf(entry())).toEqual({
      startAt: "2026-08-05T09:00:00Z",
      endAt: "2026-08-05T09:25:00Z",
    });
  });

  it("is nothing at all for a manual entry", () => {
    // A manually entered "2 hours on Tuesday" has no start time.
    expect(
      windowOf(entry({ source: "manual", startAt: null, endAt: null })),
    ).toBeNull();
  });

  it("is withdrawn once the duration has been corrected past it", () => {
    // 09:00–09:25 next to "1:30" would be two answers to the same question.
    expect(windowOf(entry({ durationMinutes: 90 }))).toBeNull();
  });
});
