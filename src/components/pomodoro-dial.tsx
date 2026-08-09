import { useTranslation } from "react-i18next";

interface PomodoroDialProps {
  /** `MM:SS` — the block's nominal length when idle, what is left when not. */
  countdown: string;
  running: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The countdown and the one button that matters.
 *
 * Start and stop are the same button in the same place: the screen has exactly
 * one action at any moment, and moving it would make the user look for it.
 */
export function PomodoroDial({
  countdown,
  running,
  canStart,
  onStart,
  onStop,
}: PomodoroDialProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-8">
      <p className="text-7xl font-light tabular-nums tracking-tight text-ink">
        {countdown}
      </p>

      <button
        type="button"
        disabled={!running && !canStart}
        onClick={running ? onStop : onStart}
        className={
          running
            ? "size-32 rounded-full border border-border text-base text-ink-muted transition-colors hover:border-danger hover:text-ink"
            : "size-32 rounded-full bg-accent text-lg font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
        }
      >
        {running ? t("timer.stop") : t("timer.start")}
      </button>
    </div>
  );
}
