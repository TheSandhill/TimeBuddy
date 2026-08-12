# The e2e suite

Everything `npm test` cannot reach: the window, the tray, and the OS between
them. These tests launch the real binary and ask **Windows** what happened —
never the app, and never the DOM.

That distinction is the whole reason the suite exists. #30 shipped a window
that could not be dragged, and every test passed: the ones that mention
dragging assert `data-tauri-drag-region` is in the DOM, which was true the
entire time it was broken. Here the DOM only ever says *where to press*.

## Running it

```powershell
npm run e2e:build   # a release build with a debugging port; minutes, not seconds
npm run test:e2e
```

Needs, on Windows:

- **msedgedriver**, matching the installed **WebView2 runtime** version — not
  the Edge version, and not whichever msedgedriver happens to be lying around:
  a driver a major ahead refuses the session instead of driving the app, which
  is how CI first failed. The runtime's own version is in the registry, under
  `HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`,
  and drivers are at `https://msedgedriver.microsoft.com/<version>/edgedriver_win64.zip`.
  Put it on the `PATH` or point `MSEDGEDRIVER` at it. The CI job does exactly
  this, in `.github/workflows/e2e.yml`.
- **A desktop that is logged in and unlocked.** The drag test moves the real
  mouse pointer, because nothing else moves a window (below). Do not type
  during a run.

Rebuild whenever Rust or the frontend changes: `test:e2e` runs whatever
`e2e:build` last produced, and says so rather than running against a binary
that is not there.

## Why it is built the way it is

**A separate binary.** `npm run e2e:build` is a release build with
`tauri.e2e.conf.json` merged over the config. It asks the webview for a
debugging port and repeats wry's own default browser arguments beside it,
because that setting replaces wry's string rather than adding to it. The port
is not in a shipped build, and `lib.rs` has two tests about it: one fails if it
ever appears in `tauri.conf.json`, the other if the e2e window drifts from the
shipped one in any respect but that key.

**Not tauri-driver**, which is the documented route and does not work here.
msedgedriver asks the app for a debugging port through
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`; wry always passes
`additionalBrowserArguments` itself, and per the WebView2 API that is exactly
what makes the environment variable ignored. The session comes up attached to
`about:blank` and every selector times out. So the port is asked for in the
config, where wry will carry it, and the app is launched by the suite.

**A real mouse for the drag.** `data-tauri-drag-region` ends in
`WM_NCLBUTTONDOWN`, and the modal move loop Windows enters there is driven by
the OS input queue. WebDriver's synthetic events are dispatched inside the
renderer and never reach it — a WebDriver drag would hang, not move. So
`support/win32.ps1` presses the actual mouse, and the actual window rect is
what is asserted. It raises the window and refuses if anything is covering the
point first: a real mouse presses whatever is on top there, and dragging the
editor you had open would fail the test for no reason to do with the app.

**An empty `%APPDATA%` and `%LOCALAPPDATA%` per launch.** The database lives in
one and WebView2's user data folder in the other, and both matter. The first
keeps the suite off the developer's real hours. The second keeps each launch
in a browser process of its own: two WebView2 hosts sharing a user data folder
share the browser behind it, so a launch that joined one started without the
debugging port would never open it — which is a genuinely confusing way for
this to fail, since the app is running and the port simply is not there.

## What is covered

| Test                       | Asks                                                     |
| -------------------------- | -------------------------------------------------------- |
| `titlebar-drag`            | Does dragging the titlebar move the window?              |
| `close-hides-to-tray`      | Does close hide the window and leave the app running?    |

The tray icon's *presence* is covered by implication rather than by
enumeration: `hide_to_tray` refuses to hide when there is no tray, and a
refused hide is a close that closes (ADR-0004). A window that is hidden with
the process still alive is therefore a window with a tray behind it.

## What is not covered

**The tray menu.** Starting and stopping a block from Show / Start / Quit is
the third test #33 asked for, and it is not here. Reaching it means finding a
tray icon's screen rect and right-clicking it: WebDriver cannot see the
notification area at all, and Windows 11 moved the icons behind an overflow
flyout that has to be driven through UI Automation. That is a different
harness, not another test in this one — #43.

What is asserted instead, in unit tests, is that both halves agree on the
event: `src-tauri/src/tray.rs` reads `src/tray/use-tray.ts` and fails if the
strings drift. That covers the wiring and not the click.
