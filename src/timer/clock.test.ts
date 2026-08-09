import { describe, expect, it } from "vitest";
import { currentInstant, formatClock, localDay, plusMinutes } from "./clock";

describe("naming instants", () => {
  it("reads the wall clock as an RFC 3339 instant", () => {
    expect(currentInstant()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("adds minutes without dragging milliseconds along", () => {
    expect(plusMinutes("2026-08-05T09:00:00Z", 5)).toBe("2026-08-05T09:05:00Z");
  });

  it("files an instant under the day it is where the user is", () => {
    // Built from local parts on purpose: the assertion has to hold in every
    // timezone the suite might run in, including CI's UTC.
    const evening = new Date(2026, 7, 5, 23, 30);

    expect(localDay(evening.toISOString())).toBe("2026-08-05");
    expect(formatClock(evening.toISOString())).toBe("23:30");
  });
});
