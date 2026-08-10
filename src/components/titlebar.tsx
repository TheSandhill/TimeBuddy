import { useTranslation } from "react-i18next";
import { formatCountdown, remainingSeconds } from "../timer/block";
import type { RunningBlock } from "../timer/use-running-block";
import { closeWindow, minimizeWindow } from "../tray/window-buttons";

/**
 * The window's own chrome (ADR-0004).
 *
 * `decorations: false` is what makes the titlebar themeable, and what makes
 * dragging and the buttons ours to provide. There is no maximize button, and
 * that is the point: dropping native decorations forfeits Snap Layouts and
 * double-click-to-maximize, and offering no maximize at all sidesteps
 * reimplementing any of it.
 *
 * Close asks the window to close and leaves it there. Whether that ends up
 * hiding it in the tray is Rust's to decide, in the one place every close
 * arrives at — otherwise this button and Alt+F4 would be two closes that meant
 * different things.
 */
export function Titlebar({ block, now }: RunningBlock) {
  const { t } = useTranslation();

  return (
    <header
      data-tauri-drag-region
      className="grid h-10 shrink-0 grid-cols-3 items-center border-b border-border bg-surface-raised px-3"
    >
      <span
        data-tauri-drag-region
        className="text-sm font-medium tracking-wide text-ink"
      >
        {t("app.name")}
      </span>

      {/*
       * The pill is what lets the timer be left alone: whichever screen is
       * open, the block is still visible. Absent rather than blank when
       * nothing runs, so the bar carries no placeholder.
       *
       * `role="timer"` rather than `status`: a live region would have a screen
       * reader announce every second of it.
       */}
      <div data-tauri-drag-region className="flex justify-center">
        {block ? (
          <span
            role="timer"
            className="rounded-full bg-surface px-3 py-0.5 text-xs font-medium tabular-nums text-accent"
          >
            {formatCountdown(remainingSeconds(block, now))}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label={t("titlebar.minimize")}
          onClick={() => void minimizeWindow()}
          className="size-3 rounded-full bg-border transition-colors hover:bg-accent"
        />
        {/*
         * Terracotta, not the usual harsh red: this button is a step away, not
         * a destruction — it does not even end the block.
         */}
        <button
          type="button"
          aria-label={t("titlebar.close")}
          onClick={() => void closeWindow()}
          className="size-3 rounded-full bg-border transition-colors hover:bg-danger"
        />
      </div>
    </header>
  );
}
