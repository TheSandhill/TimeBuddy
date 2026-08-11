import { useTranslation } from "react-i18next";
import type { RestoreFault } from "../data/types";

/** One catalogue key per fault. A code, never a sentence from Rust. */
const faultLabels = {
  stagedFileRejected: "restore.failedRejected",
  safetyCopyFailed: "restore.failedSafetyCopy",
  swapFailed: "restore.failedSwap",
} as const satisfies Record<RestoreFault, string>;

/**
 * The one place the app says a restore did not happen.
 *
 * Across the top of every screen, like a failed backup, and for the same reason:
 * the person who asked for this was already recovering from something. Opening
 * quietly on old data would read as the restore having worked, which is the one
 * lie this feature cannot tell (ADR-0008).
 *
 * There is no retry button. Every fault here is fixed outside the app — a drive
 * to plug back in, a folder to reconnect — and two of the three leave the
 * restore staged, so the next launch is the retry.
 */
export function RestoreBanner({ fault }: { fault: RestoreFault }) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-4 border-b border-danger bg-surface-raised px-6 py-2"
    >
      <span className="text-sm text-danger">{t(faultLabels[fault])}</span>
      <span className="text-sm text-ink-muted">{t("restore.dataUntouched")}</span>
    </div>
  );
}
