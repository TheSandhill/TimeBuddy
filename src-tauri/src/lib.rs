mod archive;
mod clients;
mod db;
mod error;
mod projects;
mod reports;
mod schema;
mod settings;
mod text;
mod time_entries;

#[cfg(test)]
mod test_support;

use tauri::Manager;

use db::Db;

/// The SQLite file, resolved against the app data directory.
const DB_FILE: &str = "timebuddy.db";

/// The same file in the URL form `tauri-plugin-sql` keys its migrations by.
/// Must name `DB_FILE`, or the plugin would migrate a database nothing reads.
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
            let path = app.path().app_data_dir()?.join(DB_FILE);
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
}
