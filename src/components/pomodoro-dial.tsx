import { useTranslation } from "react-i18next";
import { AppMark } from "./app-mark";
import { heroButtonClass, heroQuietButtonClass } from "./button";
import { Icon } from "./icon";

/** The ring's geometry, in the SVG's own units. */
const DIAL_SIZE = 236;
const RING_RADIUS = 106;
const RING_STROKE = 9;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * The Mug's drawn width, and **the one line to tune it** — a perceptual value,
 * set by the owner's eye rather than derived from anything here.
 *
 * Worth knowing before it is changed again: `CONTEXT.md` → Mug makes the digits
 * dominant by **weight**, not by size — they are the largest type, the thing
 * that moves, and the only thing in the circle that speaks. So the mark being
 * the wider of the two at 88 against 60px digits is allowed, and the rule that
 * killed the 190px prototype variant was really that it had no ring.
 *
 * The ceiling that remains is therefore the ring: the digits and the mark have
 * to go on fitting inside it, which is what the test asserts.
 */
const MARK_WIDTH = 88;

/**
 * The held glyph's size, and a knob like the mark's.
 *
 * It is allowed to be large — larger than the digits — because unlike the mark
 * it *is* the message while it is on screen. The ceiling is the ring: a glyph
 * wider than the circle's inside would read as an overlay on the screen rather
 * than a state of the dial.
 */
const HELD_GLYPH = "size-20";

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
         * word, a flat muted ring, and — since ADR-0016 — a dimmed Mug.
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
          {/*
           * `relative z-10` earns its keep the moment the mark steams: the steam
           * rises past the digits, and painting order alone would put it over
           * them because the mark comes later in the tree. Behind is the only
           * option that keeps the digits the thing this screen is about.
           *
           * Held drains them to muted ink rather than hiding them: what is left
           * on the clock is still the truth, it has just stopped being spent.
           */}
          <p
            className={`relative z-10 text-dial font-light leading-none tabular-nums tracking-tight transition-colors motion-base ease-out-soft ${
              paused ? "text-ink-muted" : "text-ink"
            }`}
          >
            {countdown}
          </p>

          {/*
           * The slot's deferral is over (ADR-0016). Dimming when held is the
           * third signal `CONTEXT.md` → Mug says the mark owes the app — the
           * spare a held block has not had since the mug was parked.
           *
           * The steam follows the ring rather than the block: a held cup that
           * went on steaming would be the same disagreement as a ring still
           * breathing over a stopped countdown. It is pleasure, not signal —
           * held is already said three ways without it.
           *
           * `"off"` rather than dropping the prop, so the layer is mounted
           * before Start is ever pressed and has something to fade from.
           */}
          <AppMark
            width={MARK_WIDTH}
            dimmed={paused}
            steam={running && !paused ? "on" : "off"}
          />
        </div>

        {/*
         * Held, projected over the whole dial.
         *
         * `z-20` rather than nothing: the digits carry `z-10` for the steam, and
         * this has to sit over them — it is the one thing on this screen allowed
         * to.
         *
         * Mounted always and toggled, for the same reason the steam layer is:
         * something that appears from nothing has nothing to animate from, and
         * both directions are supposed to move. `bounce` because it arrives on an
         * overshoot, which is the tier's whole definition — and a tier rather
         * than a number, so reduced motion collapses it without a branch here.
         *
         * Nothing is lost when it does collapse. The glyph, the drained digits
         * and the muted ring are all still there; only the arrival stops moving.
         *
         * `text-ink` — the clock's own colour, not the accent. The two trade
         * places when a block is held: the digits drain to muted and the glyph
         * takes the full ink, so the brightest thing in the circle is always
         * whichever one is currently the point.
         */}
        <div
          data-held={paused ? "on" : "off"}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-20 grid place-items-center text-ink transition-[opacity,scale] motion-bounce ease-bounce-soft ${
            paused ? "scale-100 opacity-100" : "scale-75 opacity-0"
          }`}
        >
          <Icon name="pause" className={HELD_GLYPH} />
        </div>
      </div>

      {/*
       * The word the glyph replaced, still said — out loud only.
       *
       * A glyph cannot speak: the set is `aria-hidden` with no way to pass a
       * label, and ADR-0014 is explicit that a glyph needing to talk is a
       * control missing its `aria-label` rather than a glyph to annotate. This
       * is not a control, so the state needs its own voice.
       *
       * It has to be here and not the titlebar's pill: that pill is
       * `role="timer"` precisely so a screen reader does *not* announce it every
       * second, which also means it never announces the hold. This element is
       * always mounted and only its text changes, because a live region that
       * appears at the same moment its content does is unreliably announced.
       */}
      <p role="status" className="sr-only">
        {paused ? t("timer.paused") : ""}
      </p>

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
