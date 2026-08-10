mod account;
mod archive;
mod clients;
mod db;
mod error;
mod export;
mod projects;
mod reports;
mod running_timer;
mod schema;
mod settings;
mod text;
mod time_entries;
mod tray;

#[cfg(test)]
mod test_support;

use tauri::Manager;

use db::Db;

/// The SQLite file, resolved against the app **config** directory.
///
/// That is where `tauri-plugin-sql` puts a `sqlite:` URL, and the plugin is
/// what migrates the file — so this is not a free choice.
const DB_FILE: &str = "timebuddy.db";

/// The same file in the URL form `tauri-plugin-sql` keys its migrations by.
/// Must name `DB_FILE`, or the plugin would migrate a database nothing reads.
///
/// It must also appear in `plugins.sql.preload` in `tauri.conf.json`: the
/// plugin only opens — and only migrates — the databases listed there.
const DB_URL: &str = "sqlite:timebuddy.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Only for the native save dialog the export runs through. Writing the
        // file itself stays in Rust, so the frontend never holds a file handle.
        .plugin(tauri_plugin_dialog::init())
        // The chime is synthesised in the webview; this is the other half of
        // "the block has ended" — the one that arrives when TimeBuddy is behind
        // another window, which is where it usually is.
        .plugin(tauri_plugin_notification::init())
        // No launch arguments: TimeBuddy started by Windows should behave
        // exactly like TimeBuddy started by hand.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, schema::migrations())
                .build(),
        )
        .setup(|app| {
            // The plugin has already migrated the file by the time app setup
            // runs; this pool is the one every command goes through (ADR-0002).
            //
            // The directory is created here as well as by the plugin, so that
            // opening the pool never depends on someone else's side effect
            // having happened first — SQLite reports a missing parent
            // directory as a bare "unable to open database file".
            let dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&dir)?;

            let path = dir.join(DB_FILE);
            let pool = tauri::async_runtime::block_on(db::connect(&path))?;

            // Windows keeps its own copy of "start with Windows", and a user
            // can change it from Task Manager without this app hearing about
            // it. This row is the authoritative one, so launch re-asserts it
            // onto Windows rather than reading Windows back — that is what
            // keeps the checkbox from describing something that is no longer
            // true.
            //
            // A failure here is not worth refusing to start over: the app works
            // fine, one preference is out of step, and the Settings screen will
            // say so the next time it is saved.
            if let Ok(settings) = tauri::async_runtime::block_on(settings::get(&pool)) {
                let _ = settings::apply_autostart(app, settings.autostart);
            }

            app.manage(Db(pool));
            app.manage(tray::TrayMenu::default());
            Ok(())
        })
        // Close means hide, not quit: a block keeps running after the window
        // goes away, and quitting lives in the tray menu (ADR-0004). Handled
        // here rather than only in the titlebar's button so that Alt+F4 does
        // the same thing — otherwise the app would have two closes that meant
        // different things.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if tray::hide_to_tray(window) {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            account::account_exists,
            account::create_account,
            account::unlock_account,
            account::resume_session,
            account::reset_account_password,
            clients::list_clients,
            clients::get_client,
            clients::create_client,
            clients::update_client,
            clients::archive_client,
            clients::restore_client,
            projects::list_projects,
            projects::get_project,
            projects::create_project,
            projects::update_project,
            projects::archive_project,
            projects::restore_project,
            time_entries::list_time_entries,
            time_entries::get_time_entry,
            time_entries::create_time_entry,
            time_entries::update_time_entry,
            time_entries::delete_time_entry,
            running_timer::get_running_timer,
            running_timer::start_running_timer,
            running_timer::stop_running_timer,
            running_timer::discard_running_timer,
            reports::report_by_client,
            reports::report_by_project,
            export::export_report,
            settings::get_settings,
            settings::update_settings,
            tray::sync_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_plugin_and_the_pool_open_the_same_file() {
        assert_eq!(DB_URL, format!("sqlite:{DB_FILE}"));
    }

    /// The plugin migrates only the databases named in `plugins.sql.preload`.
    /// Leave ours out and it never runs a migration, never creates the app
    /// directory, and the pool opens onto nothing — which is exactly the
    /// silence this test exists to break.
    #[test]
    fn the_config_asks_the_plugin_to_preload_our_database() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json"))
                .expect("tauri.conf.json is valid JSON");

        let preload = config["plugins"]["sql"]["preload"]
            .as_array()
            .expect("plugins.sql.preload is a list");

        assert!(
            preload.iter().any(|db| db == DB_URL),
            "plugins.sql.preload must contain {DB_URL}, got {preload:?}"
        );
    }

    /// ADR-0004 gives up Snap Layouts by not offering maximize at all, and
    /// keeps the window usable with a floor rather than a fixed size. All
    /// three are settings, so all three can be undone by an edit that meant
    /// nothing by it.
    #[test]
    fn the_window_cannot_be_maximised_and_has_a_floor_to_resize_to() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json"))
                .expect("tauri.conf.json is valid JSON");

        let window = &config["app"]["windows"][0];

        assert_eq!(window["decorations"], serde_json::json!(false));
        assert_eq!(window["maximizable"], serde_json::json!(false));
        assert_eq!(window["resizable"], serde_json::json!(true));
        assert!(window["minWidth"].as_i64().unwrap_or(0) > 0);
        assert!(window["minHeight"].as_i64().unwrap_or(0) > 0);
    }
}
