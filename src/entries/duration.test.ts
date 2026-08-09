import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "./duration";

/** The minutes a readable input came to, or the test fails loudly. */
function minutesOf(input: string): number {
  const result = parseDuration(input);
  if (!result.ok) {
    throw new Error(`expected ${input} to parse, got ${result.problem}`);
  }
  return result.minutes;
}

function problemOf(input: string): string {
  const result = parseDuration(input);
  if (result.ok) {
    throw new Error(`expected ${input} to be rejected, got ${result.minutes}`);
  }
  return result.problem;
}

describe("parsing what a person types into a duration field", () => {
  it("reads a colon as hours and minutes", () => {
    expect(minutesOf("1:30")).toBe(90);
    expect(minutesOf("0:45")).toBe(45);
    expect(minutesOf("10:05")).toBe(605);
  });

  it("reads a Dutch decimal comma as hours", () => {
    expect(minutesOf("1,5")).toBe(90);
    expect(minutesOf("0,25")).toBe(15);
    expect(minutesOf("7,75")).toBe(465);
  });

  it("reads a decimal point the same way", () => {
    expect(minutesOf("1.5")).toBe(90);
    expect(minutesOf(".5")).toBe(30);
  });

  it("reads a bare whole number as minutes", () => {
    // "90" is ninety minutes, not ninety hours — nobody works ninety hours.
    expect(minutesOf("90")).toBe(90);
    expect(minutesOf("25")).toBe(25);
  });

  it("takes an explicit unit at its word, in either language", () => {
    expect(minutesOf("90m")).toBe(90);
    expect(minutesOf("90 min")).toBe(90);
    expect(minutesOf("2h")).toBe(120);
    expect(minutesOf("2u")).toBe(120);
    expect(minutesOf("2 uur")).toBe(120);
    expect(minutesOf("1,5h")).toBe(90);
    expect(minutesOf("1,5 uur")).toBe(90);
  });

  it("reads an hour and its minutes written without a colon", () => {
    expect(minutesOf("1h30")).toBe(90);
    expect(minutesOf("1u30")).toBe(90);
    expect(minutesOf("1h30m")).toBe(90);
    expect(minutesOf("2 uur 15 min")).toBe(135);
  });

  it("ignores the whitespace and the capitals", () => {
    expect(minutesOf("  1:30  ")).toBe(90);
    expect(minutesOf("2H")).toBe(120);
    expect(minutesOf("1,5 U")).toBe(90);
  });

  it("rounds fractions of a minute rather than storing them", () => {
    // Minutes are the unit the database stores; a third of an hour is 20.
    expect(minutesOf("0,336")).toBe(20);
    expect(minutesOf("1,009")).toBe(61);
  });

  it("rejects what it cannot read rather than guessing", () => {
    for (const input of ["", "   ", "abc", "1:2:3", "1,5,5", "--", "1:60"]) {
      expect(problemOf(input), input).toBe("durationUnreadable");
    }
  });

  it("rejects a duration that is not time spent", () => {
    expect(problemOf("0")).toBe("durationNotPositive");
    expect(problemOf("0:00")).toBe("durationNotPositive");
    expect(problemOf("-30")).toBe("durationUnreadable");
  });

  it("rejects more than a day, the way the database would", () => {
    expect(minutesOf("24:00")).toBe(1440);
    expect(problemOf("24:01")).toBe("durationExceedsDay");
    expect(problemOf("25h")).toBe("durationExceedsDay");
  });
});

describe("the bounds this field turns away before the database does", () => {
  it("uses the same ceiling Rust does", () => {
    // The rule has one home (`time_entries::validate`); saying it early here
    // is a courtesy, and this test is what stops the two drifting apart.
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
    );
    const timeEntriesRs = readFileSync(
      path.join(repoRoot, "src-tauri", "src", "time_entries.rs"),
      "utf8",
    );
    const [, ceiling] =
      timeEntriesRs.match(/MAX_DURATION_MINUTES: i64 = (\d+)/) ?? [];

    expect(ceiling, "no MAX_DURATION_MINUTES in time_entries.rs").toBeDefined();
    expect(minutesOf(`${ceiling}m`)).toBe(Number(ceiling));
    expect(problemOf(`${Number(ceiling) + 1}m`)).toBe("durationExceedsDay");
  });
});

describe("showing a duration back", () => {
  it("writes hours and minutes, zero-padded", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(1440)).toBe("24:00");
  });

  it("round-trips through the parser", () => {
    for (const minutes of [1, 45, 90, 605, 1440]) {
      expect(minutesOf(formatDuration(minutes))).toBe(minutes);
    }
  });
});
