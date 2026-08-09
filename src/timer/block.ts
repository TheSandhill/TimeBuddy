/**
 * The duration maths behind a Pomodoro Block.
 *
 * Every function here is pure and takes the current instant as an argument:
 * elapsed time is the distance between two wall-clock readings, never a tally
 * kept by a counting interval (`CONTEXT.md`, Running Timer). A block therefore
 * behaves identically whether the app watched it tick or the laptop slept
 * through the whole thing.
 */

import type { Instant, RunningTimer } from "../data/types";
import { instantAt, MS_PER_SECOND, SECONDS_PER_MINUTE } from "./clock";

/** The longest a single TimeEntry may be, mirroring the schema's CHECK. */
export const MAX_BLOCK_MINUTES = 1440;

/** What a block should leave behind, decided at the moment it ends. */
export type BlockOutcome =
  /** Reached zero: logs its full nominal length. */
  | { kind: "completed"; durationMinutes: number; endAt: Instant }
  /** Ended by hand: logs the actual elapsed time, never the nominal length. */
  | { kind: "stoppedEarly"; durationMinutes: number; endAt: Instant }
  /** Not yet a whole minute — a misclick, not work. Nothing is written. */
  | { kind: "tooShort" }
  /** Longer than a day, which no TimeEntry may hold. */
  | { kind: "tooLong"; durationMinutes: number };

/**
 * How long the block has been running.
 *
 * Clamped at zero: a clock that jumps backwards — a timezone fix, an NTP
 * correction — should make the timer stand still, not run in reverse.
 */
export function elapsedSeconds(block: RunningTimer, now: Instant): number {
  const seconds =
    (Date.parse(now) - Date.parse(block.startAt)) / MS_PER_SECOND;
  return Math.max(0, Math.floor(seconds));
}

/** What the countdown shows. Zero once the block is done, never negative. */
export function remainingSeconds(block: RunningTimer, now: Instant): number {
  const planned = block.plannedMinutes * SECONDS_PER_MINUTE;
  return Math.max(0, planned - elapsedSeconds(block, now));
}

export function isComplete(block: RunningTimer, now: Instant): boolean {
  return remainingSeconds(block, now) === 0;
}

/**
 * What ending the block right now would log.
 *
 * A completed block ends at the instant it ran out, not at the instant we
 * noticed. That single choice is what makes a crash three days later offer 25
 * minutes back instead of three days.
 *
 * A part-finished minute is dropped rather than rounded up: entries are stored
 * as truth (`CONTEXT.md`), and rounding 24m40s up would log exactly the
 * nominal length an early stop is never allowed to claim.
 */
export function outcomeAt(block: RunningTimer, now: Instant): BlockOutcome {
  const completed = isComplete(block, now);
  const durationMinutes = completed
    ? block.plannedMinutes
    : Math.floor(elapsedSeconds(block, now) / SECONDS_PER_MINUTE);

  if (durationMinutes > MAX_BLOCK_MINUTES) {
    return { kind: "tooLong", durationMinutes };
  }
  if (durationMinutes === 0) {
    return { kind: "tooShort" };
  }

  const endAt = completed
    ? instantAt(
        Date.parse(block.startAt) +
          block.plannedMinutes * SECONDS_PER_MINUTE * MS_PER_SECOND,
      )
    : instantAt(Date.parse(now));

  return { kind: completed ? "completed" : "stoppedEarly", durationMinutes, endAt };
}

/**
 * `MM:SS`. Minutes keep accumulating past sixty rather than growing an hours
 * field — a block long enough to need one is already a mistake.
 */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / SECONDS_PER_MINUTE);
  const rest = whole % SECONDS_PER_MINUTE;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Whole seconds from `now` until `deadline`, floored at zero. */
export function secondsUntil(deadline: Instant, now: Instant): number {
  return Math.max(
    0,
    Math.floor((Date.parse(deadline) - Date.parse(now)) / MS_PER_SECOND),
  );
}
