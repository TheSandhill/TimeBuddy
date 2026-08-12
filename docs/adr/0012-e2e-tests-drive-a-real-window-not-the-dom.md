# ADR-0012: The e2e suite drives a real window, not the DOM

- **Status**: Accepted
- **Date**: 2026-08-12

## Context

ADR-0004 dropped native decorations, which made dragging, closing and quitting the app's own to
provide — each one an IPC call, each one a grant in `capabilities/default.json` that fails **in
silence** when it is missing. That is the shape of the problem: nothing throws, nothing logs, the
button simply does nothing.

It has already happened. The window shipped once unable to be dragged for want of a single
permission, and the whole suite passed, because the tests that mention dragging assert that
`data-tauri-drag-region` is in the DOM — true the entire time it was broken.

Everything else the window does is in the same position. Close-hides-to-tray is a Rust event handler
and a Win32 `ShowWindow`; the tray is a native menu. None of it exists in jsdom, so none of it was
covered by anything.

## Decision

A second suite, `e2e/`, that launches the built binary and asks **Windows** what happened. The DOM is
allowed to say *where to press* and nothing else; every assertion reads the window rect, the window's
visibility, or whether the process is alive, through `user32` from PowerShell.

Three things follow from that, and each of them was arrived at by the alternative failing:

**The mouse is real.** `data-tauri-drag-region` ends in `WM_NCLBUTTONDOWN`, and the modal move loop
Windows enters there is fed by the OS input queue. WebDriver's synthetic events are dispatched inside
the renderer and never reach it — a WebDriver drag hangs rather than moves. So the suite moves the actual
pointer and presses the actual button, through `SetCursorPos` and `mouse_event`, which is also why it
needs a desktop that is logged in and why it raises the window and checks nothing is on top of it
first: a real mouse presses whatever is there.

**Not tauri-driver**, though it is the documented route. It hands msedgedriver the binary and lets it
launch and attach, and msedgedriver asks for the debugging port through
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` — which the WebView2 API ignores whenever the host sets
`additionalBrowserArguments` itself, which wry always does. The session comes up attached to
`about:blank` and every selector times out. The port is therefore asked for in
`tauri.e2e.conf.json`, where wry carries it, and the app is launched by the suite.

**So the binary under test is not the binary that ships**, and that is the cost of this decision.
`npm run e2e:build` is a release build whose window carries `additionalBrowserArgs`: the debugging
port, and beside it the arguments wry passes by default — the setting *replaces* wry's string rather
than adding to it, so a build that named only the port would also be a build with the mini menu and
SmartScreen back, which the shipped one does not have.

Two tests in `lib.rs` hold the gap open no wider: one fails if the port ever appears in
`tauri.conf.json`, the other if the e2e window differs from the shipped one in any respect but that
one key.

Kept out of `npm test` entirely, and out of the unit config: `npm test` needs no binary, no
WebDriver and no desktop, and must keep needing none of them.

## Consequences

The regression that prompted this is now caught: with `core:window:allow-start-dragging` removed, the
drag test fails and everything else still passes.

**The tray menu is still not covered.** Clicking Start/Stop on the icon means finding a tray icon's
screen rect and driving a native menu — WebDriver cannot see the notification area, and Windows 11
put the icons behind an overflow flyout that only UI Automation reaches. That is a different harness,
and it is still owed rather than a gap this ADR pretends to close. What the icon's *presence* is
covered by is implication: `hide_to_tray` refuses to hide when there is no tray, so a window that hid
with the process still alive had one.

The suite is slow — a release build, then an app launch per file — so it is a CI job of its own,
which also means a red e2e run does not block reading a unit failure.
