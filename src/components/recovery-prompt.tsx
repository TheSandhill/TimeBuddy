import { useTranslation } from "react-i18next";
import type { BlockOutcome } from "../timer/block";

interface RecoveryPromptProps {
  outcome: BlockOutcome;
  busy: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}

/**
 * What the app asks when it finds a Pomodoro Block still in flight on launch.
 *
 * It asks rather than decides: silently discarding loses real work, silently
 * logging invents it (`CONTEXT.md`, Running Timer).
 */
export function RecoveryPrompt({
  outcome,
  busy,
  onKeep,
  onDiscard,
}: RecoveryPromptProps) {
  const { t } = useTranslation();
  const keepable =
    outcome.kind === "completed" || outcome.kind === "stoppedEarly";

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-6">
      <h2 className="text-lg font-medium text-ink">{t("timer.recoveryTitle")}</h2>

      <p className="text-sm text-ink-muted">
        {keepable
          ? t("timer.recoveryBody", { minutes: outcome.durationMinutes })
          : t("timer.recoveryNothing")}
      </p>

      <div className="flex gap-3">
        {keepable ? (
          <button
            type="button"
            disabled={busy}
            onClick={onKeep}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("timer.recoveryKeep")}
          </button>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className="rounded-md border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-danger hover:text-ink disabled:opacity-40"
        >
          {t("timer.recoveryDiscard")}
        </button>
      </div>
    </section>
  );
}
