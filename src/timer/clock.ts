/**
 * Reading and naming instants.
 *
 * `currentInstant` is the one impure corner of the timer: everything else
 * takes the instant as an argument, which is what makes the duration maths
 * testable without pretending to control time.
 */

import type { Day, Instant } from "../data/types";

const MS_PER_MINUTE = 60_000;

const pad = (value: number) => String(value).padStart(2, "0");

/** The wall clock, read once. */
export function currentInstant(): Instant {
  return new Date().toISOString();
}

export function plusMinutes(instant: Instant, minutes: number): Instant {
  return new Date(Date.parse(instant) + minutes * MS_PER_MINUTE)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
}

/**
 * The calendar day an instant falls on **where the user is**.
 *
 * `toISOString().slice(0, 10)` would give the UTC day, which quietly files an
 * evening block under tomorrow for anyone east of Greenwich.
 */
export function localDay(instant: Instant): Day {
  const date = new Date(instant);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:MM` on the user's own clock, for showing when an entry ran. */
export function formatClock(instant: Instant): string {
  const date = new Date(instant);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
