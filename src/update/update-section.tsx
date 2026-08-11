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
 */

import { useTranslation } from "react-i18next";
import { useCurrentVersion, useUpdateCheck } from "./use-update";

const sectionClass = "flex flex-col gap-4 border-t border-border pt-4";
const legendClass = "text-xs uppercase tracking-widest text-ink-muted";
const quietButtonClass =
  "rounded-md border border-border px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink";

export function UpdateSection() {
  const { t } = useTranslation();

  const version = useCurrentVersion();
  const check = useUpdateCheck();

  return (
    <section className={sectionClass} aria-label={t("update.title")}>
      <h2 className={legendClass}>{t("update.title")}</h2>

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
          <span role="alert" className="text-sm text-danger">
            {t("update.checkFailed")}
          </span>
        ) : check.update === null ? (
          <span role="status" className="text-sm text-ink-muted">
            {t("update.upToDate")}
          </span>
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
      <p className="text-xs text-ink-muted">{t("update.verifiedNote")}</p>
    </section>
  );
}
