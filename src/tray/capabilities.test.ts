/**
 * The capability file, asserted against the chrome that depends on it.
 *
 * `decorations: false` (ADR-0004) makes dragging and the window buttons ours to
 * provide, and each of those is an IPC call the ACL can refuse. A refusal is
 * silent — the button does nothing, the window does not move, and no error is
 * raised anywhere — so nothing in a jsdom test can see it. Asserting the grant
 * is present is the only feedback loop this repo has for it, and it is the loop
 * that was missing when the titlebar shipped undraggable (#30).
 *
 * It proves the permission is granted, not that dragging works. Issue #33 is
 * the e2e suite that would prove the latter.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const capability = JSON.parse(
  readFileSync(
    path.join(repoRoot, "src-tauri", "capabilities", "default.json"),
    "utf8",
  ),
) as { permissions: string[]; windows: string[] };

describe("the main window's capability", () => {
  it("applies to the window the titlebar is in", () => {
    expect(capability.windows).toContain("main");
  });

  it.each([
    // Without this the drag regions in the titlebar are inert markup.
    "core:window:allow-start-dragging",
    "core:window:allow-minimize",
    "core:window:allow-close",
  ])("grants %s, because the titlebar asks for it", (permission) => {
    expect(capability.permissions).toContain(permission);
  });

  it("grants no way out of the app but the tray's Quit (ADR-0004)", () => {
    // process:allow-restart finishes an update and is the only one wanted.
    expect(capability.permissions).not.toContain("core:app:allow-app-hide");
    expect(capability.permissions).not.toContain("process:allow-exit");
  });

  it("stays minimal: no window permission is granted that nothing calls", () => {
    // Resizing works through the native borders that survive `decorations:
    // false`, so the frontend never starts a resize drag itself.
    expect(capability.permissions).not.toContain(
      "core:window:allow-start-resize-dragging",
    );
  });
});
