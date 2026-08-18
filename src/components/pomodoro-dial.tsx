import { useTranslation } from "react-i18next";
import { heroButtonClass, heroQuietButtonClass } from "./button";
import { Icon } from "./icon";

/** The ring's geometry, in the SVG's own units. */
const DIAL_SIZE = 236;
const RING_RADIUS = 106;
const RING_STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface PomodoroDialProps {
  /** `MM:SS` — the block's nominal length when idle, what is left when not. */
  countdown: string;
  /** How much of the block is left, 0–1. Only drawn while one is alive. */
  remaining: number;
  running: boolean;
  paused: boolean;
  canStart: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/**
 * The ring, the countdown inside it, and the two controls under it.
 *
 * The dial **owns the Timer screen** (`CONTEXT.md`): flat, the five things on
 * that screen read as a settings page with a large circle on it, so the ring
 * takes the top and the digits are the largest thing on it by a clear margin.
 * The ring is what a glance gets; the digits are the truth.
 *
 * The big button is always "the obvious thing to do next" — Start, then Pause,
 * then Resume — so the user never has to look for it. **Stop is a smaller button
 * beside it**, and that asymmetry is the point: stopping is rarer and writes
 * hours, and giving it the same weight as pausing invites hitting it by
 * accident. It only appears once there is something to stop.
 */
export function PomodoroDial({
  countdown,
  remaining,
  running,
  paused,
  canStart,
  onStart,
  onPause,
  onResume,
  onStop,
}: PomodoroDialProps) {
  const { t } = useTranslation();

  const primary = !running
    ? { label: t("timer.start"), glyph: "play" as const, act: onStart }
    : paused
      ? { label: t("timer.resume"), glyph: "play" as const, act: onResume }
      : { label: t("timer.pause"), glyph: "pause" as const, act: onPause };

  // An idle dial shows the length it would run, not a full ring of progress:
  // the arc is what a block spends, so with no block there is nothing spent.
  const drawn = running ? Math.min(Math.max(remaining, 0), 1) : 0;

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative grid place-items-center">
        {/*
         * One of the app's two loops (ADR-0004), and it stops the moment the
         * block is held: a ring still breathing over a countdown that has
         * stopped moving would be the app disagreeing with itself. Held is the
         * word plus a flat muted ring, and there is no third signal spare.
         */}
        <svg
          width={DIAL_SIZE}
          height={DIAL_SIZE}
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          aria-hidden="true"
          className={running && !paused ? "animate-breath" : undefined}
        >
          <g
            transform={`rotate(-90 ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
          >
            <circle
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={RING_RADIUS}
              className="stroke-hairline"
            />
            <circle
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={RING_RADIUS}
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - drawn)}
              className={`transition-[stroke-dashoffset] motion-quick ease-out-soft ${
                paused ? "stroke-ink-muted" : "stroke-accent"
              }`}
            />
          </g>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <p className="text-dial font-light leading-none tabular-nums tracking-tight text-ink">
            {countdown}
          </p>

          {/*
           * Announced rather than merely styled: a countdown that has stopped
           * moving is the one state of this screen that reads as a broken app.
           */}
          {paused ? (
            <p role="status" className="text-xs font-medium text-accent">
              {t("timer.paused")}
            </p>
          ) : null}

          {/*
           * Reserved, and empty on purpose. Whatever mark ends up representing
           * TimeBuddy goes here, under the digits, and must never grow enough to
           * compete with them (ADR-0004: the Mug is deferred, and a placeholder
           * glyph would be exactly the competition that rule forbids).
           */}
          <span data-dial-mark />
        </div>
      </div>

      <div className="flex w-full items-stretch gap-3">
        <button
          type="button"
          disabled={!running && !canStart}
          onClick={primary.act}
          className={`${heroButtonClass} flex-1`}
        >
          <Icon name={primary.glyph} />
          {primary.label}
        </button>

        {running ? (
          <button
            type="button"
            onClick={onStop}
            className={heroQuietButtonClass}
          >
            <Icon name="stop" />
            {t("timer.stop")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
