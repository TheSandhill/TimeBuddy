import { useTranslation } from "react-i18next";
import { quietDangerButtonClass } from "./button";

interface PomodoroDialProps {
  /** `MM:SS` — the block's nominal length when idle, what is left when not. */
  countdown: string;
  running: boolean;
  paused: boolean;
  canStart: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

/**
 * The countdown and the buttons under it.
 *
 * The big one is always "the obvious thing to do next" — Start, then Pause,
 * then Resume — so the user never has to look for it. **Stop is a smaller
 * button beside it**, and that asymmetry is the point: stopping is rarer and
 * writes hours, and giving it the same weight as pausing invites hitting it by
 * accident. It only appears once there is something to stop.
 */
export function PomodoroDial({
  countdown,
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
    ? { label: t("timer.start"), act: onStart }
    : paused
      ? { label: t("timer.resume"), act: onResume }
      : { label: t("timer.pause"), act: onPause };

  return (
    <div className="flex flex-col items-center gap-8">
      <p className="text-7xl font-light tabular-nums tracking-tight text-ink">
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

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          disabled={!running && !canStart}
          onClick={primary.act}
          className="size-32 rounded-full bg-accent text-lg font-medium text-surface transition-opacity motion-quick hover:opacity-90 disabled:opacity-40"
        >
          {primary.label}
        </button>

        {running ? (
          <button
            type="button"
            onClick={onStop}
            className={quietDangerButtonClass}
          >
            {t("timer.stop")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
