import { useTranslation } from "react-i18next";
import type { BlockOutcome } from "../timer/block";
import { primaryButtonClass, quietDangerButtonClass } from "./button";

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
    <section className="flex flex-col gap-4 rounded-lg bg-surface-raised p-6">
      <h2 className="text-lg font-medium text-ink">
        {t("timer.recoveryTitle")}
      </h2>

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
            className={primaryButtonClass}
          >
            {t("timer.recoveryKeep")}
          </button>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={onDiscard}
          className={quietDangerButtonClass}
        >
          {t("timer.recoveryDiscard")}
        </button>
      </div>
    </section>
  );
}
