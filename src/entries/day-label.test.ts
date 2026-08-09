import { describe, expect, it } from "vitest";
import { dayLabel } from "./day-label";

describe("naming the day a group of entries belongs to", () => {
  it("writes the day out in the reader's language", () => {
    expect(dayLabel("2026-08-05", "nl")).toMatch(/augustus/);
    expect(dayLabel("2026-08-05", "en")).toMatch(/August/);
  });

  it("names the day the date says, not the one a timezone shifts it to", () => {
    // `new Date("2026-08-05")` is midnight UTC, which is the 4th in New York.
    expect(dayLabel("2026-08-05", "en")).toMatch(/\b5\b/);
  });
});
