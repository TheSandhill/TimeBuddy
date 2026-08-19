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
 *
 * It sits inside Settings' "Data and version" group — with the backup folder and
 * the update check, the other two things on that screen that can fail — and is
 * **boxed off inside it**. Everything else in the group is a line to read or a
 * button to press again; this one replaces the database, re-locks the app with
 * the password from the day the backup was made, and needs a relaunch. Giving it
 * the same weight as its neighbours would be lying about that, so it wears a
 * raised panel and a heading of its own rather than a hairline like theirs.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { momentLabel } from "../backup/moment-label";
import { quietButtonClass } from "../components/button";
import {
  fieldClass,
  labelClass,
  quietHeadingClass,
  setApartClass,
} from "../components/field";
import { Icon } from "../components/icon";
import { StatusLine } from "../components/status-line";
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
    <section className={setApartClass} aria-label={t("restore.title")}>
      <h2 className={quietHeadingClass}>
        {/* Deliberately not the group's own `data` glyph: the heading above must
            not look like the one dangerous control sitting inside it. */}
        <Icon name="restore" />
        {t("restore.title")}
      </h2>

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
              <StatusLine tone="error">{t(errorKey(cancel.error))}</StatusLine>
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
            <StatusLine tone="warning">
              {preview.data.entriesSince === 0
                ? t("restore.costNothing", {
                    when: when(preview.data.madeAt),
                  })
                : t("restore.cost", {
                    when: when(preview.data.madeAt),
                    entries: preview.data.entriesSince,
                    hours: formatDuration(preview.data.minutesSince),
                  })}
            </StatusLine>
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
              {/* `error`, where the launch-time restore banner is `warning`
                  (ADR-0014). Same feature, different question: that one reports
                  a swap nobody asked for that did not happen, and this one
                  answers the button just pressed. */}
              {stage.isError ? (
                <StatusLine tone="error">{t(errorKey(stage.error))}</StatusLine>
              ) : null}
            </div>
          )}
        </>
      )}
    </section>
  );
}
