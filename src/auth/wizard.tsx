/**
 * First run: three steps, then an app that already works.
 *
 * The point is the last line. A fresh install that lands on five empty screens
 * has taught the user nothing and given them nothing to do; one that lands on
 * a Timer with a project already in the picker is ready to be pressed.
 *
 * Each step commits as it is finished rather than at the end. Setting a
 * password writes the account, choosing a folder writes the settings row, and
 * naming the first work writes a client and a project — so a wizard abandoned
 * halfway leaves an install that is set up as far as it got, not one that has
 * to be started over.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open as chooseDirectory } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import { primaryButtonClass } from "../components/button";
import { fieldClass, labelClass, quietLabelClass } from "../components/field";
import { FormError } from "../components/form-error";
import {
  createAccount,
  createClient,
  createProject,
  getSettings,
  updateSettings,
} from "../data/commands";
import { errorKey } from "../data/error-message";

/** The three steps, in the order they are walked. */
const steps = ["password", "backup", "work"] as const;
export type Step = (typeof steps)[number];

export function Wizard({
  startAt = "password",
  onDone,
}: {
  /**
   * Where to pick the walk up. Setup that was abandoned after the password
   * was chosen resumes here rather than starting over — the account already
   * exists, and asking for a second one would only be refused.
   */
  startAt?: Step;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>(startAt);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [client, setClient] = useState("");
  const [project, setProject] = useState("");

  const fail = (cause: unknown) => setError(t(errorKey(cause)));
  const advance = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const setUpAccount = useMutation({
    mutationFn: () => createAccount(password, phrase),
    onSuccess: () => advance("backup"),
    onError: fail,
  });

  const chooseFolder = useMutation({
    mutationFn: () => chooseDirectory({ directory: true, multiple: false }),
    // A cancelled dialog answers `null`, which is not a choice to record.
    onSuccess: (chosen) => typeof chosen === "string" && setFolder(chosen),
  });

  /**
   * Saved as a unit, like every other write to the settings row (`CONTEXT.md`)
   * — so this reads the row back rather than sending a folder on its own.
   */
  const saveBackupFolder = useMutation({
    mutationFn: async () => {
      const settings = await getSettings();
      await updateSettings({ ...settings, backupFolder: folder });
    },
    onSuccess: () => advance("work"),
    onError: fail,
  });

  const createFirstWork = useMutation({
    mutationFn: async () => {
      const created = await createClient(client);
      await createProject(created.id, project);
    },
    onSuccess: async () => {
      // Everything the app knows, it read while there was nothing to read.
      // The window frame was already asking about settings and a running
      // block before the first step, so the app behind this must not open
      // onto answers that predate the setup it is opening because of.
      await queryClient.invalidateQueries();
      onDone();
    },
    onError: fail,
  });

  const busy =
    setUpAccount.isPending ||
    saveBackupFolder.isPending ||
    createFirstWork.isPending;

  const submit = (run: () => void) => (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    run();
  };

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <header className="flex flex-col gap-1">
        <p className={quietLabelClass}>
          {t("wizard.step", {
            step: steps.indexOf(step) + 1,
            total: steps.length,
          })}
        </p>
        <h1 className="text-lg font-medium text-ink">
          {t(`wizard.${step}Title`)}
        </h1>
      </header>

      {step === "password" ? (
        <form
          aria-label={t("wizard.passwordTitle")}
          className="flex flex-col gap-4"
          onSubmit={submit(() => setUpAccount.mutate())}
        >
          <p className="text-sm text-ink-muted">{t("wizard.passwordHint")}</p>

          <label className={labelClass}>
            {t("wizard.password")}
            <input
              className={fieldClass}
              type="password"
              value={password}
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className={labelClass}>
            {t("wizard.recoveryPhrase")}
            <input
              className={fieldClass}
              value={phrase}
              onChange={(event) => setPhrase(event.target.value)}
            />
          </label>
          <p className="text-sm text-ink-muted">{t("wizard.recoveryHint")}</p>

          <FormError message={error} />

          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {t("wizard.next")}
          </button>
        </form>
      ) : null}

      {step === "backup" ? (
        <form
          aria-label={t("wizard.backupTitle")}
          className="flex flex-col gap-4"
          onSubmit={submit(() => saveBackupFolder.mutate())}
        >
          <p className="text-sm text-ink-muted">{t("wizard.backupHint")}</p>

          <p className="text-sm text-ink">
            {folder ?? t("wizard.backupDefault")}
          </p>

          <button
            type="button"
            className="self-start text-sm text-accent hover:opacity-90"
            disabled={chooseFolder.isPending}
            onClick={() => chooseFolder.mutate()}
          >
            {t("wizard.chooseFolder")}
          </button>

          <FormError message={error} />

          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {t("wizard.next")}
          </button>
        </form>
      ) : null}

      {step === "work" ? (
        <form
          aria-label={t("wizard.workTitle")}
          className="flex flex-col gap-4"
          onSubmit={submit(() => createFirstWork.mutate())}
        >
          <p className="text-sm text-ink-muted">{t("wizard.workHint")}</p>

          <label className={labelClass}>
            {t("wizard.client")}
            <input
              className={fieldClass}
              value={client}
              autoFocus
              onChange={(event) => setClient(event.target.value)}
            />
          </label>

          <label className={labelClass}>
            {t("wizard.project")}
            <input
              className={fieldClass}
              value={project}
              onChange={(event) => setProject(event.target.value)}
            />
          </label>

          <FormError message={error} />

          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {t("wizard.finish")}
          </button>
        </form>
      ) : null}
    </section>
  );
}
