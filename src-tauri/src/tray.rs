//! The system tray, and the reason close does not mean quit.
//!
//! `decorations: false` (ADR-0004) already made the window buttons ours to
//! wire. Close is wired to here: the timer keeps running after the window goes
//! away, so something has to be left behind that can bring it back — and that
//! something is the only place TimeBuddy can be quit from.
//!
//! The menu's words are not written here. UI copy lives in the i18n catalogues
//! (`CONTEXT.md`), so the frontend hands the labels over and this module only
//! decides what a click does. That is also why the tray is built on the first
//! `sync_tray` rather than at startup: a menu of placeholder words would be
//! worse than a moment without a menu.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, Window, Wry};

use crate::error::{Error, Result};

/// The id the icon is registered under, so a later sync finds the same tray
/// instead of growing a second one next to it.
const TRAY_ID: &str = "main";

/// The window `tauri.conf.json` describes. It names no label, so this is the
/// one Tauri gives it.
const MAIN_WINDOW: &str = "main";

/// Asks the frontend to start or stop the block.
///
/// The tray deliberately does not touch the database itself: what a stopped
/// block is worth — its full length or the minutes actually elapsed — is
/// decided in exactly one place, and that place is the Timer screen.
pub const TOGGLE_TIMER_EVENT: &str = "tray://toggle-timer";

/// Asks the frontend to hold the block, or to let it carry on.
///
/// One event for both, like `TOGGLE_TIMER_EVENT` is one for start and stop:
/// which of the two a click means is known from the row, and the frontend is
/// what has read it.
pub const TOGGLE_PAUSE_EVENT: &str = "tray://toggle-pause";

/// Says the window has just gone into the tray, so the frontend can explain
/// itself the first time.
///
/// Emitted from here rather than raised by the button, because the button is
/// not the only way to close a window: Alt+F4 arrives at the same place, and
/// the one that vanishes without a word is the one that reads as a crash.
pub const HIDDEN_TO_TRAY_EVENT: &str = "tray://hidden";

/// Everything the tray shows, in the language the app is currently in.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLabels {
    pub show: String,
    /// "Start timer" or "Stop timer" — the frontend picks, because the
    /// frontend is what knows whether a block is in flight.
    pub toggle: String,
    /// "Pause" or "Resume" — the frontend picks, for the same reason it picks
    /// `toggle`: whether the block is held is something only it has read.
    pub pause: String,
    /// Whether there is a block to hold at all.
    ///
    /// A word rather than a hidden item, and greyed rather than clickable:
    /// nothing is in flight for most of the day, and an item that answers a
    /// click by doing nothing reads as a bug.
    pub pause_enabled: bool,
    pub quit: String,
    /// What hovering the icon says, which while a block runs is how much of it
    /// is left.
    pub tooltip: String,
}

/// The menu items, kept so a later sync can rename them.
///
/// Renaming beats rebuilding: the menu the tray was built with is the one its
/// click handler is attached to.
struct TrayMenuItems {
    show: MenuItem<Wry>,
    toggle: MenuItem<Wry>,
    pause: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// Managed state — `None` until the frontend has said what the menu is called.
#[derive(Default)]
pub struct TrayMenu(Mutex<Option<TrayMenuItems>>);

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        // Unminimize first: a window hidden while minimised comes back
        // minimised, which looks exactly like nothing having happened.
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// The one exit. Quitting exists nowhere else, by design (ADR-0004).
fn quit(app: &AppHandle) {
    // `destroy`, not `close`: close is the button that hides, and going
    // through it is the one thing quit must not do.
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.destroy();
    }
    app.exit(0);
}

/// Turns a close into a hide — but only while there is a tray to bring the
/// window back from.
///
/// This is the only place that decides. Every close arrives here, the titlebar
/// button included, so "is there a tray" is asked once and answered the same
/// way for all of them.
///
/// Reports whether it hid, so a close that has nowhere to hide can behave like
/// a close. An app that vanished with no icon left behind is not minimised, it
/// is lost.
pub fn hide_to_tray(window: &Window) -> bool {
    if window.app_handle().tray_by_id(TRAY_ID).is_none() {
        return false;
    }
    if window.hide().is_err() {
        return false;
    }

    let _ = window.app_handle().emit(HIDDEN_TO_TRAY_EVENT, ());
    true
}

fn build(app: &AppHandle, labels: &TrayLabels) -> Result<TrayMenuItems> {
    let show = MenuItem::with_id(app, "show", &labels.show, true, None::<&str>)
        .map_err(Error::tray)?;
    let toggle = MenuItem::with_id(app, "toggle", &labels.toggle, true, None::<&str>)
        .map_err(Error::tray)?;
    let pause = MenuItem::with_id(
        app,
        "pause",
        &labels.pause,
        labels.pause_enabled,
        None::<&str>,
    )
    .map_err(Error::tray)?;
    let quit_item = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)
        .map_err(Error::tray)?;
    // Pause after Start/Stop rather than before it: starting is what the menu is
    // opened for, and holding a block is the rarer of the two things done to one
    // that is already under way.
    let menu = Menu::with_items(app, &[&show, &toggle, &pause, &quit_item])
        .map_err(Error::tray)?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        // Left click brings the window back, right click opens the menu —
        // what every other Windows tray icon does. Tauri would otherwise open
        // the menu on both, and the click most people make is the first one.
        .show_menu_on_left_click(false)
        .tooltip(&labels.tooltip);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.on_tray_icon_event(|tray, event| {
        if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        } = event
        {
            show_window(tray.app_handle());
        }
    })
    .on_menu_event(|app, event| match event.id.as_ref() {
        "show" => show_window(app),
        // Deliberately without showing the window: acting from the tray is the
        // point of the item, and the tray answers for itself — the menu's own
        // label flips, and the tooltip starts or stops counting.
        "toggle" => {
            let _ = app.emit(TOGGLE_TIMER_EVENT, ());
        }
        // Nor for this one, and here there is nothing to navigate to either: the
        // block's lifecycle sits above every screen (ADR-0010), so holding one
        // needs no screen to be open at all.
        "pause" => {
            let _ = app.emit(TOGGLE_PAUSE_EVENT, ());
        }
        "quit" => quit(app),
        _ => {}
    })
    .build(app)
    .map_err(Error::tray)?;

    Ok(TrayMenuItems {
        show,
        toggle,
        pause,
        quit: quit_item,
    })
}

// -- Command layer ----------------------------------------------------------

/// Creates the tray, or renames what is already there.
///
/// Called whenever the words change: on launch, when the language changes, and
/// every time the countdown the tooltip shows moves on a minute.
///
/// Failure is reported rather than swallowed. The close button asks this
/// command whether there is a tray before it hides the window behind one.
///
/// `async` is load-bearing, not decoration: building a tray icon and renaming
/// a menu item both hand their work to the main thread and block until it is
/// done. A synchronous command runs *on* the main thread, so it would block
/// waiting for itself.
#[tauri::command]
pub async fn sync_tray(
    app: AppHandle,
    tray: State<'_, TrayMenu>,
    labels: TrayLabels,
) -> Result<()> {
    let mut items = tray.0.lock().expect("tray menu lock");

    match &*items {
        Some(existing) => {
            existing.show.set_text(&labels.show).map_err(Error::tray)?;
            existing.toggle.set_text(&labels.toggle).map_err(Error::tray)?;
            existing.pause.set_text(&labels.pause).map_err(Error::tray)?;
            existing
                .pause
                .set_enabled(labels.pause_enabled)
                .map_err(Error::tray)?;
            existing.quit.set_text(&labels.quit).map_err(Error::tray)?;
        }
        None => *items = Some(build(&app, &labels)?),
    }

    app.tray_by_id(TRAY_ID)
        .ok_or_else(|| Error::Tray {
            message: format!("no tray icon with id {TRAY_ID}"),
        })?
        .set_tooltip(Some(&labels.tooltip))
        .map_err(Error::tray)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The frontend listens for this exact string. Renaming it on one side
    /// only would make the tray's Start/Stop item quietly do nothing.
    #[test]
    fn the_toggle_event_is_named_the_way_the_frontend_listens_for_it() {
        let listener = include_str!("../../src/tray/use-tray.ts");

        assert!(
            listener.contains(TOGGLE_TIMER_EVENT),
            "no listener for {TOGGLE_TIMER_EVENT} in src/tray/use-tray.ts"
        );
    }

    /// The same, for the item that holds a block: a rename on one side alone
    /// would leave a menu entry that greys and ungreys and never pauses.
    #[test]
    fn the_pause_event_is_named_the_way_the_frontend_listens_for_it() {
        let listener = include_str!("../../src/tray/use-tray.ts");

        assert!(
            listener.contains(TOGGLE_PAUSE_EVENT),
            "no listener for {TOGGLE_PAUSE_EVENT} in src/tray/use-tray.ts"
        );
    }

    /// One event per item. `tray://toggle-timer` is a prefix of nothing, but the
    /// assertions above are `contains`, so two names where one contained the
    /// other would both pass on a single listener.
    #[test]
    fn the_two_timer_events_are_told_apart_by_name() {
        assert_ne!(TOGGLE_TIMER_EVENT, TOGGLE_PAUSE_EVENT);
        assert!(!TOGGLE_PAUSE_EVENT.contains(TOGGLE_TIMER_EVENT));
        assert!(!TOGGLE_TIMER_EVENT.contains(TOGGLE_PAUSE_EVENT));
    }

    /// The same, for the event that asks the frontend to explain itself.
    #[test]
    fn the_hidden_event_is_named_the_way_the_frontend_listens_for_it() {
        let listener = include_str!("../../src/tray/use-tray.ts");

        assert!(
            listener.contains(HIDDEN_TO_TRAY_EVENT),
            "no listener for {HIDDEN_TO_TRAY_EVENT} in src/tray/use-tray.ts"
        );
    }
}
