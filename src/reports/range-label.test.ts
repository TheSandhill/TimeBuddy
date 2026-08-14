import { describe, expect, it } from "vitest";
import { rangeLabel } from "./range-label";

describe("naming the days a report covers", () => {
  it("says a week in one breath rather than twice", () => {
    const label = rangeLabel({ from: "2026-08-03", to: "2026-08-09" }, "nl");

    expect(label).toMatch(/\b3\b/);
    expect(label).toMatch(/\b9\b/);
    expect(label).toContain("augustus");
    expect(label).toContain("2026");
  });

  it("names both years when the range straddles New Year", () => {
    const label = rangeLabel({ from: "2026-12-28", to: "2027-01-03" }, "nl");

    expect(label).toContain("2026");
    expect(label).toContain("2027");
  });

  it("reads a single day as that day", () => {
    const label = rangeLabel({ from: "2026-08-05", to: "2026-08-05" }, "nl");

    expect(label).toMatch(/\b5\b/);
    expect(label).not.toMatch(/\b4\b|\b6\b/);
  });

  it("holds the day the range names, whatever the timezone", () => {
    // `new Date("2026-08-01")` is midnight UTC, which is 31 July for anyone
    // west of Greenwich — the wrong month for a month report.
    expect(
      rangeLabel({ from: "2026-08-01", to: "2026-08-31" }, "nl"),
    ).toContain("augustus");
  });

  it("follows the language the app is in", () => {
    const range = { from: "2026-08-03", to: "2026-08-09" };

    expect(rangeLabel(range, "en")).toContain("August");
    expect(rangeLabel(range, "nl")).toContain("augustus");
  });
});
