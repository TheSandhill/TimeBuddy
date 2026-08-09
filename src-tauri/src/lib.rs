mod archive;
mod clients;
mod db;
mod error;
mod projects;
mod reports;
mod running_timer;
mod schema;
mod settings;
mod text;
mod time_entries;

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
            app.manage(Db(pool));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            reports::iso_week_of,
            settings::get_settings,
            settings::update_settings,
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
}
