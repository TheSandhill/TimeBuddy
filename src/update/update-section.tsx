/**
 * Which version this is, and the one button that goes and asks about a newer one.
 *
 * The launch already asked (`useUpdatePrompt` in the shell), so this screen is
 * not where updates are *found* — it is where the answer can be read on purpose,
 * including the answer the bar across the top stays quiet about: a check that
 * could not be made at all. A laptop with no network is not worth interrupting
 * anybody over, but it is worth being able to look up.
 *
 * Installing is not offered here. It is offered on the bar, which is visible from
 * this screen too — two buttons for one act would only be two ways to start two
 * downloads.
 *
 * It is the tail of Settings' "Data and version" group and wears no heading of
 * its own: the group's name already covers the version, and a third heading in
 * one group would compete with the one heading that has to stand out there —
 * Restore's.
 */

import { useTranslation } from "react-i18next";
import { quietButtonClass } from "../components/button";
import { Icon } from "../components/icon";
import { StatusLine } from "../components/status-line";
import { useCurrentVersion, useUpdateCheck } from "./use-update";

export function UpdateSection() {
  const { t } = useTranslation();

  const version = useCurrentVersion();
  const check = useUpdateCheck();

  return (
    <section className="flex flex-col gap-4" aria-label={t("update.title")}>
      {version.data === undefined ? null : (
        <p className="text-sm text-ink">
          {t("update.currentVersion", { version: version.data })}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className={quietButtonClass}
          disabled={check.checking}
          onClick={check.check}
        >
          {check.checking ? t("update.checking") : t("update.check")}
        </button>

        {/* Three answers, and "not yet asked" is none of them: `undefined` is
            what the query says before it has one, and a screen that filled that
            in with "up to date" would be guessing. */}
        {check.checking ? null : check.failed ? (
          <StatusLine tone="error">{t("update.checkFailed")}</StatusLine>
        ) : check.update === null ? (
          <StatusLine tone="success">{t("update.upToDate")}</StatusLine>
        ) : check.update === undefined ? null : (
          <span role="status" className="text-sm text-ink">
            {t("update.available", { version: check.update.version })}
          </span>
        )}
      </div>

      {/*
        Not a word here about the "unknown publisher" prompt. That one belongs to
        the first install, which happened before this screen existed and which the
        README covers — an app that warned about it on every visit to Settings
        would be teaching her to expect a prompt updates do not show (ADR-0009).
        What is worth saying is the half that happens every time.
      */}
      <p className="glyph-label text-xs text-ink-muted">
        <Icon name="verified" className="size-4 shrink-0" />
        {t("update.verifiedNote")}
      </p>
    </section>
  );
}
