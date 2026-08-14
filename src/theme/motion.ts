/**
 * The motion tokens, read at runtime, for the one consumer that cannot read
 * CSS: the motion library.
 *
 * A transition in JavaScript wants a number of seconds and four control points,
 * and `var(--motion-base)` means nothing to it. The alternative was to restate
 * the values in TypeScript, which would give High-contrast and
 * `prefers-reduced-motion` a second place to be turned down — and a second place
 * to be forgotten. So the theme stays the only source: these read what the
 * cascade resolved, which is already the turned-down value wherever it applies
 * (ADR-0004).
 */

import type { Easing } from "motion/react";
import { motionTokens } from "./tokens";

type MotionToken = (typeof motionTokens)[number];

/** Every `--motion-*` except the one that is a length rather than a time. */
export type DurationToken = Exclude<
  Extract<MotionToken, `--motion-${string}`>,
  "--motion-page-travel"
>;

export type EasingToken = Extract<MotionToken, `--ease-${string}`>;

function resolved(token: string, root: HTMLElement): string {
  return getComputedStyle(root).getPropertyValue(token).trim();
}

/**
 * A tier in seconds, because that is the unit the library speaks and `ms` is
 * the one CSS does.
 *
 * Zero when nothing answers. A theme is always present in the app, so this is
 * the answer for a mid-swap read and for a test that never loaded a
 * stylesheet — and instant is the right failure: the element still arrives and
 * still leaves, it simply does not take its time about it.
 */
export function readDuration(
  token: DurationToken,
  root: HTMLElement = document.documentElement,
): number {
  const [, amount, unit] = /^([\d.]+)(ms|s)$/.exec(resolved(token, root)) ?? [];
  if (amount === undefined) {
    return 0;
  }
  return unit === "s" ? Number(amount) : Number(amount) / 1000;
}

/**
 * A curve as the library wants it. Anything that is not a `cubic-bezier` is
 * `linear` — which is what High-contrast flattens both bounces to, so the
 * fallback and the deliberate value are the same answer.
 */
export function readEasing(
  token: EasingToken,
  root: HTMLElement = document.documentElement,
): Easing {
  const [, points] =
    /^cubic-bezier\(([^)]*)\)$/.exec(resolved(token, root)) ?? [];
  if (points === undefined) {
    return "linear";
  }

  const numbers = points.split(",").map(Number);
  return numbers.length === 4 && numbers.every(Number.isFinite)
    ? (numbers as [number, number, number, number])
    : "linear";
}
