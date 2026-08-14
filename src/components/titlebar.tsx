import { useTranslation } from "react-i18next";
import { formatCountdown, isPaused, remainingSeconds } from "../timer/block";
import type { RunningBlock } from "../timer/lifecycle";
import { closeWindow, minimizeWindow } from "../tray/window-buttons";
import { closeButtonClass, minimizeButtonClass } from "./button";

/**
 * The glyphs, inline rather than an icon dependency: two paths is not a library,
 * and `currentColor` is what lets the button's own hover carry them.
 *
 * `aria-hidden` because the button already has its name — a glyph that announced
 * itself would give each button two.
 */
function Glyph({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-3"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The window's own chrome (ADR-0004).
 *
 * `decorations: false` is what makes the titlebar themeable, and what makes
 * dragging and the buttons ours to provide — each of them an IPC call, so each
 * of them a grant in `capabilities/default.json` that fails silently if it is
 * missing.
 *
 * The drag region is `deep` rather than bare because a bare one is **self
 * only**: it does not reach its own children, so a bar built out of nested
 * divs would be mostly holes. `deep` hands the whole subtree over, and the
 * buttons stay clickable regardless — Tauri stops at the first clickable
 * element it meets on the way up and never consults an ancestor. That is what
 * lets the buttons be 28x28 targets inside the region rather than beside it.
 *
 * Three cells: the wordmark alone on the left — there is no mark, and the slot
 * is left for one — the block's countdown centred, and the two buttons right.
 *
 * There is no maximize button, and that is the point: dropping native
 * decorations forfeits Snap Layouts and double-click-to-maximize, and offering
 * no maximize at all sidesteps reimplementing any of it. Every screen is a
 * single column by design, so a maximized window would be one column of content
 * in an empty desktop.
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
      data-tauri-drag-region="deep"
      className="grid h-10 shrink-0 grid-cols-3 items-center border-b border-border bg-surface-raised px-3"
    >
      <span className="text-sm font-medium tracking-wide text-ink">
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
      <div className="flex justify-center">
        {block ? (
          <span
            role="timer"
            className="rounded-full bg-surface px-3 py-0.5 text-xs font-medium tabular-nums text-accent"
          >
            {isPaused(block)
              ? t("titlebar.paused", {
                  countdown: formatCountdown(remainingSeconds(block, now)),
                })
              : formatCountdown(remainingSeconds(block, now))}
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          aria-label={t("titlebar.minimize")}
          onClick={() => void minimizeWindow()}
          className={minimizeButtonClass}
        >
          <Glyph d="M2.5 6h7" />
        </button>
        <button
          type="button"
          aria-label={t("titlebar.close")}
          onClick={() => void closeWindow()}
          className={closeButtonClass}
        >
          <Glyph d="M3 3l6 6M9 3l-6 6" />
        </button>
      </div>
    </header>
  );
}
