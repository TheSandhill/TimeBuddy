/**
 * Going back to a backup, from the screen the backups are already described on.
 *
 * Deliberately **not** part of the settings form. Settings are edited as a unit
 * and saved with one button; a restore is not a preference, and putting it under
 * the same Save would be the worst possible place for it.
 *
 * The shape of the screen follows the shape of the act (ADR-0008): choose,
 * be told what it costs, stage it, relaunch. Because the swap happens at the
 * next launch, the honest end state of this screen is "prepared", never "done" —
 * so there is no success tick here, there is an instruction.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { momentLabel } from "../backup/moment-label";
import { quietButtonClass } from "../components/button";
import { fieldClass, labelClass, quietLabelClass } from "../components/field";
import { errorKey } from "../data/error-message";
import { formatDuration } from "../entries/duration";
import {
  useCancelRestore,
  usePendingRestore,
  useRestorableBackups,
  useRestoreOutcome,
  useRestorePreview,
  useStageRestore,
} from "./use-restore";

const sectionClass = "flex flex-col gap-4 border-t border-hairline pt-4";

export function RestoreSection() {
  const { t, i18n } = useTranslation();

  const backups = useRestorableBackups();
  const pending = usePendingRestore();
  const outcome = useRestoreOutcome();
  const stage = useStageRestore();
  const cancel = useCancelRestore();

  /** The backup being considered, or `null` while nothing is chosen. */
  const [chosen, setChosen] = useState<string | null>(null);
  const preview = useRestorePreview(chosen);

  const when = (at: string) => momentLabel(at, i18n.language);

  return (
    <section className={sectionClass} aria-label={t("restore.title")}>
      <h2 className={quietLabelClass}>{t("restore.title")}</h2>

      {/*
        Read rather than announced, like backup staleness: a restore that worked
        is explained on the lock screen it caused, and recorded here afterwards
        so the safety copy is a file the user can name.
      */}
      {outcome.data?.status === "done" ? (
        <p className="text-sm text-ink">
          {t("restore.lastRestore", { when: when(outcome.data.restoredFrom) })}
          {outcome.data.safetyCopy === null ? null : (
            <>
              {" "}
              {t("restore.previousSavedAs", { file: outcome.data.safetyCopy })}
            </>
          )}
        </p>
      ) : null}

      {pending.data ? (
        // One restore is owed at a time, so the picker gives way to the thing
        // that is already going to happen — and to the way out of it.
        <>
          <p role="status" className="text-sm text-ink">
            {t("restore.pending", { when: when(pending.data) })}
          </p>
          <p className="text-xs text-ink-muted">{t("restore.pendingHow")}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={quietButtonClass}
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {t("restore.cancel")}
            </button>
            {cancel.isError ? (
              <span role="alert" className="text-sm text-danger">
                {t(errorKey(cancel.error))}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-muted">{t("restore.hint")}</p>

          {backups.data?.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {t("restore.noneToRestore")}
            </p>
          ) : (
            <label className={labelClass}>
              {t("restore.choose")}
              <select
                className={fieldClass}
                value={chosen ?? ""}
                onChange={(event) => setChosen(event.target.value || null)}
              >
                <option value="">{t("restore.chooseNone")}</option>
                {(backups.data ?? []).map((candidate) => (
                  <option key={candidate.fileName} value={candidate.fileName}>
                    {when(candidate.madeAt)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* The cost, in the words of what is lost. Shown before the button
              that acts on it, because that is the only order in which it is a
              warning rather than a receipt. */}
          {preview.data === undefined ? null : (
            <p className="text-sm text-danger">
              {preview.data.entriesSince === 0
                ? t("restore.costNothing", {
                    when: when(preview.data.madeAt),
                  })
                : t("restore.cost", {
                    when: when(preview.data.madeAt),
                    entries: preview.data.entriesSince,
                    hours: formatDuration(preview.data.minutesSince),
                  })}
            </p>
          )}

          {chosen === null ? null : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={quietButtonClass}
                disabled={stage.isPending || preview.data === undefined}
                onClick={() => stage.mutate(chosen)}
              >
                {stage.isPending
                  ? t("restore.preparing")
                  : t("restore.prepare")}
              </button>
              {stage.isError ? (
                <span role="alert" className="text-sm text-danger">
                  {t(errorKey(stage.error))}
                </span>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
