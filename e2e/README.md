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
  mouse pointer, because nothing else moves a window (below), and the tray test
  moves it onto the notification area. Do not type during a run.
- **No TimeBuddy of your own in the tray.** The tray test finds the icon by its
  tooltip, and two of them are two icons it cannot tell apart — so it says so
  and stops rather than pressing one at random. A session with no notification
  area at all skips that file instead, and says why.

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

**A bundle identifier of its own, and an empty pair of directories under it.**
The database lives under `%APPDATA%\<identifier>` and WebView2's user data
folder under `%LOCALAPPDATA%\<identifier>`, and both matter. The first keeps
the suite off the developer's real hours. The second keeps each launch in a
browser process of its own: two WebView2 hosts sharing a user data folder share
the browser behind it, so a launch that joined one started without the
debugging port would never open it — a genuinely confusing way for this to
fail, since the app is running and the port simply is not there.

Setting `%APPDATA%` on the launched process is the obvious way to do that and
does not work at all. Tauri resolves the app data directory with
`SHGetKnownFolderPath`, as does the WebView2 loader, and neither reads the
environment — so every run before this one opened the developer's real
database. What *can* be moved is the identifier both paths are built from, so
`tauri.e2e.conf.json` carries one of its own and `app.ts` empties the two
directories that hang off it before each launch. `lib.rs` fails if the shipped
and e2e identifiers are ever the same again.

**UI Automation, for the tray and only the tray.** A tray icon is not a window,
so `win32.ps1` cannot see it; Windows 11 hid the icons behind an overflow
flyout, so nothing older can either. `support/tray.ps1` uses UIA to find the
icon and read its tooltip, and hands everything else back to the APIs that own
it: the mouse is real, and the menu is read out of its `HMENU` because a
`TrackPopupMenu` menu exposes no items to UIA at all. At length in ADR-0013.

## What is covered

| Test                  | Asks                                                    |
| --------------------- | ------------------------------------------------------- |
| `titlebar-drag`       | Does dragging the titlebar move the window?             |
| `close-hides-to-tray` | Does close hide the window and leave the app running?   |
| `tray-menu`           | Does the icon's menu start, stop and quit — with no window? |

The tray icon's *presence* is also covered by implication, which is what
`close-hides-to-tray` leans on rather than enumerating anything:
`hide_to_tray` refuses to hide when there is no tray, and a refused hide is a
close that closes (ADR-0004). A window that is hidden with the process still
alive is therefore a window with a tray behind it.

`tray-menu` is the slow one, and unavoidably: the tray tooltip counts in whole
minutes, so watching it count down is sixty seconds of watching whatever the
block length is. The same minute buys the other half — a block stopped from the
menu logs the minute actually worked, not the twenty-five it was going to run
for (ADR-0010).

## What is not covered

**The classic notification area.** `tray.ps1` handles the pre-Windows-11 shell
as well as the flyout, but only the flyout has been run against. The CI
runners are Server images and are the other one, so a red tray job there is as
likely to be this as the app.
