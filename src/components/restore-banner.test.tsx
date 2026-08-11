import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { createI18n } from "../i18n/config";
import type { RestoreFault } from "../data/types";
import { RestoreBanner } from "./restore-banner";

const show = (fault: RestoreFault) =>
  render(
    <I18nextProvider i18n={createI18n("nl")}>
      <RestoreBanner fault={fault} />
    </I18nextProvider>,
  );

describe("saying a restore did not happen", () => {
  it("interrupts, because opening on old data in silence reads as success", () => {
    show("stagedFileRejected");

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("says the data was not overwritten, whichever way it failed", () => {
    // The reassurance is the point: this person was already recovering from
    // something, and "nothing happened" is the good news inside the bad.
    for (const fault of [
      "stagedFileRejected",
      "safetyCopyFailed",
      "swapFailed",
    ] as const) {
      const { unmount } = show(fault);

      expect(screen.getByRole("alert")).toHaveTextContent(
        /Er is niets overschreven/,
      );
      unmount();
    }
  });

  it("gives each fault its own reason rather than one shrug", () => {
    show("safetyCopyFailed");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /niet eerst apart worden gezet/,
    );
  });

  it("says the restore is still waiting when the folder is what failed", () => {
    // Nothing was consumed, so the next launch is the retry — and a person who
    // knows that will plug the drive back in rather than start over.
    show("safetyCopyFailed");

    expect(screen.getByRole("alert")).toHaveTextContent(
      /staat nog klaar voor de volgende start/,
    );
  });

  it("has no retry: every one of these is fixed outside the app", () => {
    show("swapFailed");

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
