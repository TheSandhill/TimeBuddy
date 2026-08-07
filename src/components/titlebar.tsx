import { useTranslation } from "react-i18next";

/**
 * The window runs with `decorations: false` (ADR-0004), so dragging and the
 * window buttons are ours to provide. Tray/quit behaviour arrives in a later
 * slice; for now close really closes.
 */
export function Titlebar() {
  const { t } = useTranslation();

  async function withWindow(action: "minimize" | "close") {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow()[action]();
  }

  return (
    <header
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-surface-raised px-3"
    >
      <span
        data-tauri-drag-region
        className="text-sm font-medium tracking-wide text-ink"
      >
        {t("app.name")}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("titlebar.minimize")}
          onClick={() => void withWindow("minimize")}
          className="size-3 rounded-full bg-border transition-colors hover:bg-accent"
        />
        <button
          type="button"
          aria-label={t("titlebar.close")}
          onClick={() => void withWindow("close")}
          className="size-3 rounded-full bg-border transition-colors hover:bg-danger"
        />
      </div>
    </header>
  );
}
