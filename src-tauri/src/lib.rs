mod account;
mod archive;
mod backup;
mod clients;
mod db;
mod error;
mod export;
mod projects;
mod reports;
mod restore;
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
        // Shipping is a `git tag`; updating is one click (ADR-0009). Only the
        // plugin is registered here — *whether* to offer an update is a
        // question about the person at the keyboard, so it is asked from the
        // frontend, behind the lock screen, where the answer has somewhere to
        // appear.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // The relaunch after an update installs. Nothing else uses it: the way
        // out of the app is the tray's Quit (ADR-0004), and this is the one
        // exit the app asks for on its own behalf.
        .plugin(tauri_plugin_process::init())
        // No launch arguments: TimeBuddy started by Windows should behave
        // exactly like TimeBuddy started by hand.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None::<Vec<&str>>,
        ))
        // The sql plugin is **not** registered here, and that is deliberate:
        // plugin setup hooks run before this builder's own, so a plugin added
        // on the builder would migrate the database a staged restore is about
        // to replace. It is registered inside `setup` instead, after the swap
        // (ADR-0008).
        .setup(|app| {
            // The directory is created here as well as by the plugin, so that
            // opening the pool never depends on someone else's side effect
            // having happened first — SQLite reports a missing parent
            // directory as a bare "unable to open database file".
            let dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&dir)?;

            let path = dir.join(DB_FILE);

            // Before anything opens the file: if a restore was staged, this is
            // where it happens. Nothing has a handle on the database yet, which
            // is the only moment it can be replaced (ADR-0008).
            //
            // The outcome is kept rather than acted on — a failed restore is
            // news the shell delivers, and a successful one re-locks the app.
            let restored = tauri::async_runtime::block_on(restore::take_staged(&dir, &path));

            // Now the migrations, onto whichever database came out of that.
            app.handle().plugin(
                tauri_plugin_sql::Builder::default()
                    .add_migrations(DB_URL, schema::migrations())
                    .build(),
            )?;

            // Migrated by the plugin above; this pool is the one every command
            // goes through (ADR-0002).
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
            app.manage(restore::RestoreReport::new(restored));
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
            running_timer::pause_running_timer,
            running_timer::resume_running_timer,
            running_timer::discard_running_timer,
            reports::report_by_client,
            reports::report_by_project,
            export::export_report,
            settings::get_settings,
            settings::update_settings,
            backup::backup_status,
            backup::run_backup,
            restore::list_restorable_backups,
            restore::preview_restore,
            restore::stage_restore,
            restore::cancel_restore,
            restore::pending_restore,
            restore::restore_outcome,
            restore::claim_restore_relock,
            tray::sync_tray,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `tauri.conf.json`, parsed. Several of these tests read it, and reading it
    /// through `include_str!` is what makes them tests of the shipped file
    /// rather than of a copy somebody remembered to update.
    fn config() -> serde_json::Value {
        serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json is valid JSON")
    }

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
        let config = config();

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
        let config = config();
        let window = &config["app"]["windows"][0];

        assert_eq!(window["decorations"], serde_json::json!(false));
        assert_eq!(window["maximizable"], serde_json::json!(false));
        assert_eq!(window["resizable"], serde_json::json!(true));
        assert!(window["minWidth"].as_i64().unwrap_or(0) > 0);
        assert!(window["minHeight"].as_i64().unwrap_or(0) > 0);
    }

    /// Three files carry a version number and only one of them is the one the
    /// updater compares: `tauri.conf.json`'s. A release tagged off a
    /// `package.json` that was bumped alone would ship an installer that
    /// believes it is the version it is replacing — so the update would install
    /// and change nothing, which is the worst way for this to fail (ADR-0009).
    #[test]
    fn the_three_version_numbers_agree() {
        let package: serde_json::Value =
            serde_json::from_str(include_str!("../../package.json"))
                .expect("package.json is valid JSON");

        let config = config();

        assert_eq!(
            config["version"].as_str(),
            Some(env!("CARGO_PKG_VERSION")),
            "tauri.conf.json and Cargo.toml disagree about the version"
        );
        assert_eq!(
            package["version"].as_str(),
            Some(env!("CARGO_PKG_VERSION")),
            "package.json and Cargo.toml disagree about the version"
        );
    }

    /// The updater needs somewhere to look and a key to check what it finds
    /// with. Without the key the plugin refuses to start; without `https` the
    /// one URL baked into every build would be a way to serve her anything at
    /// all over a café network (ADR-0009).
    #[test]
    fn the_updater_has_an_https_endpoint_and_a_public_key() {
        let config = config();
        let updater = &config["plugins"]["updater"];

        let endpoints = updater["endpoints"]
            .as_array()
            .expect("plugins.updater.endpoints is a list");

        assert!(!endpoints.is_empty(), "no updater endpoint to check");
        for endpoint in endpoints {
            let url = endpoint.as_str().expect("an endpoint is a string");
            assert!(url.starts_with("https://"), "{url} is not over https");
        }

        let pubkey = updater["pubkey"].as_str().unwrap_or_default();
        assert!(!pubkey.is_empty(), "plugins.updater.pubkey is empty");
    }

    /// The updater reads `latest.json` and a signature beside the installer.
    /// Neither is built unless this is on, so the flag being lost would leave a
    /// tagged release that installs fine and can never be updated from.
    #[test]
    fn the_bundle_ships_the_artifacts_the_updater_reads() {
        let config = config();

        assert_eq!(
            config["bundle"]["createUpdaterArtifacts"],
            serde_json::json!(true)
        );

        let targets = config["bundle"]["targets"]
            .as_array()
            .expect("bundle.targets is a list");
        assert!(
            targets.iter().any(|target| target == "nsis"),
            "the NSIS installer is what the updater replaces, got {targets:?}"
        );
    }

    /// The frontend asks about updates and restarts into one, so the window has
    /// to be allowed to do both. `process:allow-restart` is deliberately the
    /// only `process:` permission: `allow-exit` would be a second way out of
    /// the app, and the way out is the tray's Quit (ADR-0004).
    #[test]
    fn the_window_may_check_for_updates_and_restart_into_one() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json"))
                .expect("capabilities/default.json is valid JSON");

        let permissions = capability["permissions"]
            .as_array()
            .expect("permissions is a list");

        for needed in ["updater:default", "process:allow-restart"] {
            assert!(
                permissions.iter().any(|granted| granted == needed),
                "{needed} is missing, got {permissions:?}"
            );
        }
        assert!(
            !permissions.iter().any(|granted| granted == "process:allow-exit"),
            "process:allow-exit would be a second way to quit (ADR-0004)"
        );
    }
}
