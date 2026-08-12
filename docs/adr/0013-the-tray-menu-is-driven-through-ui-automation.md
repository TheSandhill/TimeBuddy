# ADR-0013: The tray menu is driven through UI Automation

- **Status**: Accepted
- **Date**: 2026-08-12

## Context

ADR-0012 built a suite that launches the real binary and asks Windows what happened, and closed
saying what it had not reached: the tray menu. Close-hides-to-tray covers the icon's *presence* by
implication — `hide_to_tray` refuses to hide when `tray_by_id` finds nothing — but nothing presses
anything on it, and pressing is where the interesting half is. Start/Stop from the tray is answered
by the lifecycle above every screen (ADR-0010), the item's own label is the answer the user gets
because the window deliberately does not come back, and Quit is the only way out of the app
(ADR-0004). None of that had a test.

Two things stood between the existing harness and it.

**`win32.ps1` cannot see a tray icon.** It asks user32 about windows, and a tray icon is not a
window: it is a `Shell_NotifyIcon` registration, drawn by explorer, addressable only through the
`hWnd`/`uID` pair it was registered under — which belongs to `tray-icon` and is not ours to know.
`Shell_NotifyIconGetRect` wants exactly that pair. Enumerating the notification area the old way
means reading `TBBUTTON` structures out of explorer with `ReadProcessMemory`, and on Windows 11 that
finds an empty toolbar, because the icons moved behind an overflow flyout hosted in a XAML island.

**WebDriver cannot see it either**, for the reason it could not drive the titlebar: it drives a
webview, and none of this is in one.

## Decision

A second harness, `e2e/support/tray.ps1`, that reaches the notification area through UI Automation —
and then does as little through it as possible.

UIA answers two questions and no others. **Where the icon is**, including opening the Windows 11
overflow flyout to get at it, so a real mouse can be pressed on it. And **what the icon says**, since
the tooltip is a `Shell_NotifyIcon` registration's UIA name — which is the assertion that a block is
running and counting down.

Everything else stays with the APIs that own it:

**The mouse is real**, as it is for the drag. A tray menu arrives as `WM_CONTEXTMENU` and is shown
with `TrackPopupMenu`; there is no synthetic route to either.

**The menu is read out of its `HMENU`, not out of UIA.** A `TrackPopupMenu` menu exposes no items to
UI Automation at all — the `#32768` element is there on screen with nothing under it — so the window
is all UIA is asked for, and `MN_GETHMENU`, `GetMenuString` and `GetMenuItemRect` do the rest. That
is the better half of the bargain anyway: the string is the one `set_text` put there, and the rect is
where Windows will accept a click.

**The icon is followed by UIA runtime id**, not by its tooltip, because the tooltip is the thing under
test: a running block's icon says "Nog 24 min" and nothing about TimeBuddy.

**Items are pressed by position**, like the titlebar buttons in `close-hides-to-tray`. The labels come
from the catalogues, and a reworded Dutch string is not a regression; the order is a decision.

The test walks the first-run wizard through WebDriver before any of this. That is the one place in
the suite the DOM is driven rather than pointed at, and it is setup: the tray's Start does nothing on
an install with no Projects, and rightly.

## Consequences

**A minute of the suite's runtime is a minute of waiting.** The tooltip counts in whole minutes
(`use-tray.ts`), so the shortest wait that can show it counting down is sixty seconds, whatever the
block is set to. It also buys the other assertion in the same wait: a block stopped after a minute
logs one minute, which is the elapsed time and nothing like the nominal length.

**It needed the data isolation the suite thought it had.** `app.ts` set `%APPDATA%` on the process it
launched, which does nothing at all: Tauri resolves the app data directory with
`SHGetKnownFolderPath`, as does the WebView2 loader for its user data folder, and neither reads the
environment. Every e2e run to date opened the developer's real database. Harmless while nothing wrote
to it; not harmless for a test that walks the first-run wizard and logs hours. What can be moved is
the bundle identifier both paths are built from, so `tauri.e2e.conf.json` carries one of its own and
the suite empties the two directories that hang off it. A test in `lib.rs` fails if the identifiers
are ever the same again.

**A session with no notification area skips rather than fails.** A runner with no desktop, or a
machine at its lock screen, cannot be asked whether the tray menu works — which is a different answer
from the menu being broken, and reporting it as one would be the failure this suite exists to avoid,
in the other direction. Every other absence fails loudly, including a notification area with no
TimeBuddy in it.

**Whether CI has one is not yet known.** The e2e job's runners are Windows Server images, whose shell
is the classic notification area rather than the Windows 11 flyout. Both shapes are handled and only
the second is tested, because that is the one on the desk this was written at.
