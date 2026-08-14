/**
 * Reading a duration the way a person writes one down.
 *
 * Manual entry is the primary input path (`CONTEXT.md`), and the field it goes
 * through has to accept what someone actually types after a morning's work:
 * `1:30`, `1,5`, `90m`, `2 uur 15 min`. The Dutch decimal comma is a first-class
 * form, not a fallback — the UI defaults to Dutch.
 *
 * Two conventions decide the ambiguous cases, and they are the ones every time
 * tracker uses:
 *
 * - A bare **whole** number is minutes. `90` is an hour and a half of work, not
 *   ninety hours.
 * - A bare **decimal** number is hours. `1,5` is what a timesheet means by it.
 *
 * Everything here is pure and knows nothing about React, so the rules can be
 * argued with in tests rather than through a form.
 */

/** Why an input could not become minutes. A code — the sentence is i18n's. */
export type DurationProblem =
  "durationUnreadable" | "durationNotPositive" | "durationExceedsDay";

export type ParsedDuration =
  { ok: true; minutes: number } | { ok: false; problem: DurationProblem };

const MINUTES_PER_HOUR = 60;
const MAX_DURATION_MINUTES = 1440;

/** `uur` and `hour` come first: `u` and `h` would swallow their own prefix. */
const HOURS = "uur|hour|hrs|hr|h|u";
const MINUTES = "minuten|minutes|mins|min|m";

/** An unsigned number, decimal comma or point: `2`, `1,5`, `.5`. */
const NUMBER = String.raw`\d*[.,]?\d+`;

const CLOCK = new RegExp(String.raw`^(\d+):([0-5]?\d)$`);
const HOURS_AND_MINUTES = new RegExp(
  String.raw`^(\d+)\s*(?:${HOURS})\s*(\d+)\s*(?:${MINUTES})?$`,
);
const IN_HOURS = new RegExp(String.raw`^(${NUMBER})\s*(?:${HOURS})$`);
const IN_MINUTES = new RegExp(String.raw`^(${NUMBER})\s*(?:${MINUTES})$`);
const BARE = new RegExp(String.raw`^(${NUMBER})$`);

const unreadable: ParsedDuration = {
  ok: false,
  problem: "durationUnreadable",
};

/** `1,5` and `1.5` are the same number written by two keyboards. */
const toNumber = (text: string) => Number(text.replace(",", "."));

const hasFraction = (text: string) => text.includes(",") || text.includes(".");

/**
 * The bounds the database enforces anyway, applied here so the field can say
 * so before a round trip. Kept in step with `time_entries::validate` in Rust.
 */
function bounded(minutes: number): ParsedDuration {
  const rounded = Math.round(minutes);
  if (rounded <= 0) {
    return { ok: false, problem: "durationNotPositive" };
  }
  if (rounded > MAX_DURATION_MINUTES) {
    return { ok: false, problem: "durationExceedsDay" };
  }
  return { ok: true, minutes: rounded };
}

export function parseDuration(input: string): ParsedDuration {
  const text = input.trim().toLowerCase();
  if (text === "") {
    return unreadable;
  }

  const clock = CLOCK.exec(text);
  if (clock) {
    return bounded(Number(clock[1]) * MINUTES_PER_HOUR + Number(clock[2]));
  }

  const both = HOURS_AND_MINUTES.exec(text);
  if (both) {
    const minutes = Number(both[2]);
    // `1h90` is not a duration anyone means; it is a typo worth reporting.
    return minutes < MINUTES_PER_HOUR
      ? bounded(Number(both[1]) * MINUTES_PER_HOUR + minutes)
      : unreadable;
  }

  const inHours = IN_HOURS.exec(text);
  if (inHours) {
    return bounded(toNumber(inHours[1]) * MINUTES_PER_HOUR);
  }

  const inMinutes = IN_MINUTES.exec(text);
  if (inMinutes) {
    return bounded(toNumber(inMinutes[1]));
  }

  const bare = BARE.exec(text);
  if (bare) {
    const value = toNumber(bare[1]);
    return bounded(hasFraction(bare[1]) ? value * MINUTES_PER_HOUR : value);
  }

  return unreadable;
}

/**
 * The message for a problem, as an i18n key.
 *
 * It lives here rather than with the command errors so the vocabulary and the
 * key that translates it stay in one file — `data/` has no business knowing
 * what this parser can fail at.
 */
export function durationErrorKey(
  problem: DurationProblem,
): `error.${DurationProblem}` {
  return `error.${problem}`;
}

/**
 * `H:MM` — the form the field parses back, so an entry can be edited by
 * changing what it already shows.
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  return `${hours}:${String(rest).padStart(2, "0")}`;
}
