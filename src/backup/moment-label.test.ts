import { describe, expect, it } from "vitest";
import { momentLabel } from "./moment-label";

describe("when the last backup was", () => {
  it("says both the day and the time", () => {
    // A bare date does not answer "is today's work safe" — the backup ran this
    // morning or it ran before lunch, and only one of those covers the morning.
    const label = momentLabel("2026-08-05T09:12:00Z", "nl");

    expect(label).toMatch(/2026/);
    expect(label).toMatch(/\d{1,2}:\d{2}/);
  });

  it("shows the reader's own clock, not the stamp it is stored as", () => {
    expect(momentLabel("2026-08-05T09:12:00Z", "nl")).not.toContain(
      "2026-08-05T09:12:00Z",
    );
  });

  it("speaks the language the app is in", () => {
    const nl = momentLabel("2026-08-05T09:12:00Z", "nl");
    const en = momentLabel("2026-08-05T09:12:00Z", "en");

    expect(nl).not.toBe(en);
  });
});

describe("a stamp that will not parse", () => {
  it("is shown rather than thrown over", () => {
    // This is the lock screen and the app shell, where there is nothing above to
    // catch a throw: `Intl` raising here blanks the entire window. It happened —
    // a field that crossed from Rust under the wrong name arrived as undefined.
    expect(() => momentLabel(undefined as unknown as string, "nl")).not.toThrow();
    expect(() => momentLabel("not an instant", "nl")).not.toThrow();
    expect(momentLabel("not an instant", "nl")).toBe("not an instant");
  });
});
