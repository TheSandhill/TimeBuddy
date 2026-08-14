/**
 * The Settings screen — one row in the database, edited as a unit.
 *
 * The whole row is saved at once because that is what Rust accepts: a partial
 * update would only invite half-applied states. So this screen holds a draft
 * and posts it on Save; until then nothing on disk has moved.
 *
 * The theme and the language are applied by `useAppearance` in the app shell,
 * off the saved settings — not from here. That way the app looks the way the
 * database says it does, and there is no second, prettier truth on this screen.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { momentLabel } from "../backup/moment-label";
import { useBackupStatus, useRunBackup } from "../backup/use-backup";
import { primaryButtonClass, quietButtonClass } from "../components/button";
import {
  checkboxLabelClass,
  fieldClass,
  labelClass,
  quietLabelClass,
} from "../components/field";
import { updateSettings } from "../data/commands";
import { errorKey } from "../data/error-message";
import type { Settings as StoredSettings } from "../data/types";
import { settingsKey, useSettings } from "../data/use-settings";
import { RestoreSection } from "../restore/restore-section";
import { UpdateSection } from "../update/update-section";
import { supportedLanguages, type Language } from "../i18n/config";
import { themeNames, type ThemeName } from "../theme/tokens";

/** Catalogue keys for the shipped themes — `Walnut` is a name, not a colour. */
const themeLabels = {
  walnut: "settings.themeWalnut",
  sand: "settings.themeSand",
  "high-contrast": "settings.themeHighContrast",
} as const satisfies Record<ThemeName, string>;

const languageLabels = {
  nl: "settings.languageNl",
  en: "settings.languageEn",
} as const satisfies Record<Language, string>;

/** A group of settings, divided from the last by a hairline rather than a rule. */
const sectionClass = "flex flex-col gap-4 border-t border-hairline pt-4";

export function Settings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const settings = useSettings();
  const backup = useBackupStatus();
  const backupNow = useRunBackup();

  /** Unsaved edits, or `null` while the screen still shows what is stored. */
  const [draft, setDraft] = useState<StoredSettings | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const shown = draft ?? settings.data ?? null;

  const edit = (change: Partial<StoredSettings>) =>
    setDraft((current) => {
      const base = current ?? settings.data;
      return base ? { ...base, ...change } : current;
    });

  const saving = useMutation({
    mutationFn: (next: StoredSettings) => updateSettings(next),
    onSuccess: async (saved) => {
      setProblem(null);
      // Back to showing what is stored: the draft has become the truth, and
      // the shell re-applies the theme and language off the same query.
      setDraft(null);
      queryClient.setQueryData(settingsKey, saved);
      await queryClient.invalidateQueries({ queryKey: settingsKey });
    },
    onError: (error) => setProblem(t(errorKey(error))),
  });

  const chooseFolder = useMutation({
    mutationFn: () => open({ directory: true, multiple: false }),
    onSuccess: (chosen) => {
      // A dismissed dialog is an answer: keep the folder that was already set.
      if (typeof chosen === "string") {
        edit({ backupFolder: chosen });
      }
    },
  });

  if (settings.isPending) {
    return <p className="text-sm text-ink-muted">{t("settings.loading")}</p>;
  }

  if (shown === null) {
    return (
      <p role="alert" className="text-sm text-danger">
        {t("settings.loadFailed")}
      </p>
    );
  }

  /** A whole-number field that never lets the row go to `NaN` minutes. */
  const minutes = (value: string) => Math.trunc(Number(value)) || 0;

  return (
    <form
      className="flex max-w-xl flex-col gap-6"
      aria-label={t("settings.title")}
      onSubmit={(event) => {
        event.preventDefault();
        saving.mutate(shown);
      }}
    >
      <fieldset className={sectionClass}>
        <legend className={quietLabelClass}>{t("settings.appearance")}</legend>

        <fieldset className="flex flex-col gap-2">
          <legend className={quietLabelClass}>{t("settings.theme")}</legend>
          {themeNames.map((theme) => (
            <label key={theme} className={checkboxLabelClass}>
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={shown.theme === theme}
                // While Windows is in charge, a picker that still answers
                // would be showing a choice nothing acts on.
                disabled={shown.followSystem}
                onChange={() => edit({ theme })}
              />
              {t(themeLabels[theme])}
            </label>
          ))}
        </fieldset>

        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={shown.followSystem}
            onChange={(event) => edit({ followSystem: event.target.checked })}
          />
          {t("settings.followSystem")}
        </label>
        <p className="text-xs text-ink-muted">{t("settings.followSystemHint")}</p>

        <label className={labelClass}>
          {t("settings.language")}
          <select
            className={fieldClass}
            value={shown.language}
            onChange={(event) =>
              edit({ language: event.target.value as Language })
            }
          >
            {supportedLanguages.map((language) => (
              <option key={language} value={language}>
                {t(languageLabels[language])}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className={sectionClass}>
        <legend className={quietLabelClass}>{t("settings.timer")}</legend>

        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            {t("settings.pomodoroMinutes")}
            <input
              className={fieldClass}
              type="number"
              min={1}
              value={shown.pomodoroMinutes}
              onChange={(event) =>
                edit({ pomodoroMinutes: minutes(event.target.value) })
              }
            />
          </label>

          <label className={labelClass}>
            {t("settings.breakMinutes")}
            <input
              className={fieldClass}
              type="number"
              min={1}
              value={shown.breakMinutes}
              onChange={(event) =>
                edit({ breakMinutes: minutes(event.target.value) })
              }
            />
          </label>
        </div>

        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={shown.chimeEnabled}
            onChange={(event) => edit({ chimeEnabled: event.target.checked })}
          />
          {t("settings.chime")}
        </label>

        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={shown.notificationsEnabled}
            onChange={(event) =>
              edit({ notificationsEnabled: event.target.checked })
            }
          />
          {t("settings.notifications")}
        </label>
      </fieldset>

      <fieldset className={sectionClass}>
        <legend className={quietLabelClass}>{t("settings.system")}</legend>

        <label className={checkboxLabelClass}>
          <input
            type="checkbox"
            checked={shown.autostart}
            onChange={(event) => edit({ autostart: event.target.checked })}
          />
          {t("settings.autostart")}
        </label>
      </fieldset>

      <fieldset className={sectionClass}>
        <legend className={quietLabelClass}>{t("backup.title")}</legend>

        <p className="text-xs text-ink-muted">{t("backup.hint")}</p>

        <div className="flex flex-col gap-2">
          <span className={quietLabelClass}>{t("settings.backupFolder")}</span>
          <p className="break-all text-sm text-ink">
            {shown.backupFolder ?? t("settings.backupFolderDefault")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={quietButtonClass}
              disabled={chooseFolder.isPending}
              onClick={() => chooseFolder.mutate()}
            >
              {t("settings.chooseFolder")}
            </button>
            {shown.backupFolder === null ? null : (
              <button
                type="button"
                className={quietButtonClass}
                onClick={() => edit({ backupFolder: null })}
              >
                {t("settings.useDefaultFolder")}
              </button>
            )}
          </div>
        </div>

        {/*
          Read off the folder, not off a column: the newest file's own name is
          when the last backup succeeded (ADR-0007). A backup made from here
          updates this line without a round trip, because the command answers
          with the folder as it stands afterwards.
        */}
        <p className="text-sm text-ink">
          {backup.data === undefined
            ? t("backup.reading")
            : backup.data.lastBackupAt === null
              ? t("backup.never")
              : t("backup.last", {
                  when: momentLabel(backup.data.lastBackupAt, i18n.language),
                  kept: backup.data.kept,
                })}
        </p>

        {/* The quiet half of the warning. A stale folder is announced across the
            top of the app when a backup actually fails; here it is simply read,
            in the one place someone comes to look. */}
        {backup.data?.stale ? (
          <p className="text-sm text-danger">{t("backup.staleNote")}</p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            className={quietButtonClass}
            disabled={backupNow.isPending}
            onClick={() => backupNow.mutate()}
          >
            {backupNow.isPending ? t("backup.running") : t("backup.now")}
          </button>
          {backupNow.isError ? (
            <span role="alert" className="text-sm text-danger">
              {t(errorKey(backupNow.error))}
            </span>
          ) : null}
          {backupNow.isSuccess ? (
            <span role="status" className="text-sm text-ink-muted">
              {t("backup.done")}
            </span>
          ) : null}
        </div>
      </fieldset>

      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={saving.isPending}
        >
          {saving.isPending ? t("settings.saving") : t("settings.save")}
        </button>
        {saving.isSuccess && draft === null ? (
          <span role="status" className="text-sm text-ink-muted">
            {t("settings.saved")}
          </span>
        ) : null}
      </div>

      {/*
        Below the Save on purpose, and outside every fieldset: a restore is not a
        preference. It touches neither the draft nor the row this form posts, so
        Save cannot carry one and its own buttons cannot submit this form.
      */}
      <RestoreSection />

      {/* Below the restore for the same reason it is below the Save: which
          version this is is not a preference either, and nothing here posts. */}
      <UpdateSection />
    </form>
  );
}
