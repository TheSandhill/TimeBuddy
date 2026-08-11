/**
 * The lock screen, and the way past it when the password has gone.
 *
 * Recovery is entirely offline (ADR-0003): the phrase chosen during setup buys
 * a new password, with no email, no server and no reset link. That is the whole
 * point of not encrypting the database — no single forgotten string can destroy
 * years of billing records.
 *
 * A reset does not open the door. It sets the password and hands back to the
 * lock screen to be used, so that "your password has been changed" is never
 * something the user has to infer from an error about something else.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { primaryButtonClass } from "../components/button";
import { fieldClass, labelClass } from "../components/field";
import { FormError } from "../components/form-error";
import { resetAccountPassword, unlockAccount } from "../data/commands";
import { errorKey } from "../data/error-message";

export function Unlock({ onOpen }: { onOpen: (token: string | null) => void }) {
  const { t } = useTranslation();

  const [recovering, setRecovering] = useState(false);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wasReset, setWasReset] = useState(false);

  const fail = (cause: unknown) => setError(t(errorKey(cause)));

  const unlock = useMutation({
    mutationFn: () => unlockAccount(password, remember),
    // Named rather than passed through: a mutation hands its callback three
    // arguments, and only the first is a token.
    onSuccess: (token) => onOpen(token),
    onError: fail,
  });

  const reset = useMutation({
    mutationFn: () => resetAccountPassword(phrase, newPassword),
    onSuccess: () => {
      // Both secrets go the moment they stop being needed. Neither is worth
      // leaving in a field, or in the state behind one, for the rest of the
      // session.
      setPhrase("");
      setNewPassword("");
      setRecovering(false);
      setError(null);
      setWasReset(true);
    },
    onError: fail,
  });

  const busy = unlock.isPending || reset.isPending;

  const stopRecovering = () => {
    setPhrase("");
    setNewPassword("");
    setRecovering(false);
    setError(null);
  };

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 py-12">
      <h1 className="text-lg font-medium text-ink">
        {recovering ? t("unlock.recoverTitle") : t("unlock.title")}
      </h1>

      {recovering ? (
        <form
          aria-label={t("unlock.recoverTitle")}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            reset.mutate();
          }}
        >
          <p className="text-sm text-ink-muted">{t("unlock.recoverHint")}</p>

          {/*
           * Masked, unlike the copy the wizard asks to be written down: this
           * is the field where a reset credential is typed back in, on the
           * shared laptop ADR-0003 is about.
           */}
          <label className={labelClass}>
            {t("unlock.recoveryPhrase")}
            <input
              className={fieldClass}
              type="password"
              value={phrase}
              autoFocus
              onChange={(event) => setPhrase(event.target.value)}
            />
          </label>

          <label className={labelClass}>
            {t("unlock.newPassword")}
            <input
              className={fieldClass}
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </label>

          <FormError message={error} />

          <div className="flex items-center gap-3">
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              {t("unlock.setPassword")}
            </button>
            <button
              type="button"
              className="text-sm text-ink-muted hover:text-ink"
              onClick={stopRecovering}
            >
              {t("unlock.back")}
            </button>
          </div>
        </form>
      ) : (
        <form
          aria-label={t("unlock.title")}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            unlock.mutate();
          }}
        >
          {wasReset ? (
            <p role="status" className="text-sm text-accent">
              {t("unlock.passwordChanged")}
            </p>
          ) : null}

          <label className={labelClass}>
            {t("unlock.password")}
            <input
              className={fieldClass}
              type="password"
              value={password}
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            {t("unlock.remember")}
          </label>

          <FormError message={error} />

          <div className="flex items-center gap-3">
            <button type="submit" className={primaryButtonClass} disabled={busy}>
              {t("unlock.unlock")}
            </button>
            <button
              type="button"
              className="text-sm text-ink-muted hover:text-ink"
              onClick={() => {
                setRecovering(true);
                setWasReset(false);
                setError(null);
              }}
            >
              {t("unlock.forgot")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
