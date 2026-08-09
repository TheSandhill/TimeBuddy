import { describe, expect, it } from "vitest";
import type { RunningTimer } from "../data/types";
import {
  elapsedSeconds,
  formatCountdown,
  isComplete,
  outcomeAt,
  remainingSeconds,
} from "./block";

const block: RunningTimer = {
  projectId: 1,
  startAt: "2026-08-05T09:00:00Z",
  plannedMinutes: 25,
};

describe("elapsed time comes from the wall clock", () => {
  it("measures the distance between two instants", () => {
    expect(elapsedSeconds(block, "2026-08-05T09:10:00Z")).toBe(600);
  });

  it("survives the laptop sleeping through the middle of a block", () => {
    // Nothing counted while the machine was asleep, yet 40 minutes passed.
    expect(elapsedSeconds(block, "2026-08-05T09:40:00Z")).toBe(2400);
  });

  it("never reports negative elapsed time when the clock moves backwards", () => {
    expect(elapsedSeconds(block, "2026-08-05T08:59:00Z")).toBe(0);
  });

  it("counts down to zero and stops there", () => {
    expect(remainingSeconds(block, "2026-08-05T09:10:00Z")).toBe(900);
    expect(remainingSeconds(block, "2026-08-05T09:25:00Z")).toBe(0);
    expect(remainingSeconds(block, "2026-08-05T11:00:00Z")).toBe(0);
  });

  it("is complete only once the nominal length has passed", () => {
    expect(isComplete(block, "2026-08-05T09:24:59Z")).toBe(false);
    expect(isComplete(block, "2026-08-05T09:25:00Z")).toBe(true);
  });
});

describe("a Pomodoro Block stopped early", () => {
  it("logs the actual elapsed time, never the nominal length", () => {
    expect(outcomeAt(block, "2026-08-05T09:10:00Z")).toEqual({
      kind: "stoppedEarly",
      durationMinutes: 10,
      endAt: "2026-08-05T09:10:00Z",
    });
  });

  it("rounds to the nearest minute", () => {
    expect(outcomeAt(block, "2026-08-05T09:10:20Z")).toMatchObject({
      durationMinutes: 10,
    });
    expect(outcomeAt(block, "2026-08-05T09:10:40Z")).toMatchObject({
      durationMinutes: 11,
    });
  });

  it("logs nothing at all when it barely ran", () => {
    // Under half a minute rounds to zero, and a zero-length entry would be
    // inventing a record of work that did not happen.
    expect(outcomeAt(block, "2026-08-05T09:00:20Z")).toEqual({
      kind: "tooShort",
    });
  });
});

describe("a Pomodoro Block that reached the end", () => {
  it("logs its full length", () => {
    expect(outcomeAt(block, "2026-08-05T09:25:00Z")).toEqual({
      kind: "completed",
      durationMinutes: 25,
      endAt: "2026-08-05T09:25:00Z",
    });
  });

  it("ends when it ended, not when we noticed", () => {
    // The machine slept past zero. The block still finished at 09:25 — using
    // the wake-up instant would log two hours nobody worked.
    expect(outcomeAt(block, "2026-08-05T11:00:00Z")).toEqual({
      kind: "completed",
      durationMinutes: 25,
      endAt: "2026-08-05T09:25:00Z",
    });
  });

  it("offers the same block back after a crash days later", () => {
    expect(outcomeAt(block, "2026-08-08T14:31:07Z")).toEqual({
      kind: "completed",
      durationMinutes: 25,
      endAt: "2026-08-05T09:25:00Z",
    });
  });

  it("refuses a block longer than a day, which no entry may hold", () => {
    const marathon: RunningTimer = { ...block, plannedMinutes: 1441 };

    expect(outcomeAt(marathon, "2026-08-06T09:01:00Z")).toEqual({
      kind: "tooLong",
      durationMinutes: 1441,
    });
  });
});

describe("countdown formatting", () => {
  it("renders minutes and seconds", () => {
    expect(formatCountdown(1500)).toBe("25:00");
    expect(formatCountdown(59)).toBe("00:59");
    expect(formatCountdown(0)).toBe("00:00");
  });

  it("keeps counting in minutes past an hour rather than adding a field", () => {
    expect(formatCountdown(3600)).toBe("60:00");
  });
});
