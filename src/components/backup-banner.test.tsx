import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import type { Instant } from "../data/types";
import { BackupBanner } from "./backup-banner";

function renderBanner(lastBackupAt: Instant | null, retrying = false) {
  const onRetry = vi.fn();
  render(
    <I18nextProvider i18n={createI18n("nl")}>
      <BackupBanner
        lastBackupAt={lastBackupAt}
        onRetry={onRetry}
        retrying={retrying}
      />
    </I18nextProvider>,
  );
  return onRetry;
}

describe("the backup warning", () => {
  it("announces itself rather than sitting quietly in the layout", () => {
    // The whole feature is worth nothing if the failure is not noticed.
    renderBanner("2026-07-29T09:00:00Z");

    expect(screen.getByRole("alert")).toHaveTextContent(
      /De laatste back-up is mislukt/,
    );
  });

  it("says what is still safe, so the news is not worse than it is", () => {
    renderBanner("2026-07-29T09:00:00Z");

    expect(screen.getByRole("alert")).toHaveTextContent(/2026/);
  });

  it("says there is nothing at all rather than naming a time it does not have", () => {
    renderBanner(null);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /er is nog geen back-up/i,
    );
  });

  it("offers the retry, so the answer to an unplugged drive is a button", () => {
    const onRetry = renderBanner("2026-07-29T09:00:00Z");

    fireEvent.click(screen.getByRole("button", { name: "Opnieuw proberen" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("cannot be pressed twice while it is running", () => {
    renderBanner(null, true);

    expect(screen.getByRole("button", { name: "Back-uppen…" })).toBeDisabled();
  });

  it("has no dismiss — the condition going away is what takes it down", () => {
    renderBanner(null);

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
