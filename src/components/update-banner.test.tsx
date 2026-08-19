import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";
import { createI18n } from "../i18n/config";
import { glyphOf, pathsIn } from "../test/glyph";
import { UpdateBanner } from "./update-banner";

function renderBanner(
  overrides: Partial<Parameters<typeof UpdateBanner>[0]> = {},
) {
  const onInstall = vi.fn();
  const onDismiss = vi.fn();
  render(
    <I18nextProvider i18n={createI18n("nl")}>
      <UpdateBanner
        version="0.2.0"
        onInstall={onInstall}
        onDismiss={onDismiss}
        installing={false}
        failed={false}
        {...overrides}
      />
    </I18nextProvider>,
  );
  return { onInstall, onDismiss };
}

describe("the update offer", () => {
  it("names the version, so an update is a thing and not a rumour", () => {
    renderBanner();

    expect(screen.getByRole("status")).toHaveTextContent(/0\.2\.0/);
  });

  it("is a status and not an alert, because nothing is wrong", () => {
    // A failed backup interrupts. A newer version is an offer, and dressing it
    // as an alarm is how alarms stop being read.
    renderBanner();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("installs when the offer is taken", () => {
    const { onInstall } = renderBanner();

    fireEvent.click(screen.getByRole("button", { name: "Nu bijwerken" }));

    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("can be waved off, unlike the backup warning", () => {
    // Nothing is at risk if this is ignored, so a bar that could not be got rid
    // of would just be a bar.
    const { onDismiss } = renderBanner();

    fireEvent.click(screen.getByRole("button", { name: "Later" }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("cannot be pressed twice while it downloads", () => {
    renderBanner({ installing: true });

    expect(screen.getByRole("button", { name: "Bijwerken…" })).toBeDisabled();
  });

  it("keeps the offer and says so when the install failed", () => {
    renderBanner({ failed: true });

    expect(screen.getByRole("alert")).toHaveTextContent(/niet.*bijgewerkt/i);
    expect(screen.getByRole("button", { name: "Nu bijwerken" })).toBeEnabled();
  });

  it("warns that the app restarts, so it is not a surprise", () => {
    // She may have a block running. Restarting without warning would read as a
    // crash, which is the same reason the first hide-to-tray explains itself.
    renderBanner();

    expect(screen.getByRole("status")).toHaveTextContent(/opnieuw/i);
  });
});

describe("the shape a failed install wears", () => {
  it("is `error`: the user pressed this one", () => {
    renderBanner({ failed: true });

    expect(pathsIn(screen.getByRole("alert"))).toEqual(glyphOf("error"));
  });

  it("draws no glyph anywhere in the offer, which is not a failure of anything", () => {
    // The set has no `update` or `download`, and inventing one is a change to
    // the set with its own reasoning — not something a banner decides.
    renderBanner();

    expect(pathsIn(screen.getByRole("status"))).toEqual([]);
  });
});
