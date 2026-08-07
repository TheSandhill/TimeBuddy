use tauri_plugin_sql::Migration;

/// The SQLite file, resolved by the plugin against the app data directory.
const DB_URL: &str = "sqlite:timebuddy.db";

/// Schema history. Empty for the scaffold — every table arrives as a numbered
/// `MigrationKind::Up` entry appended here, never edited in place (ADR-0001).
fn migrations() -> Vec<Migration> {
    vec![]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_sql::MigrationKind;

    #[test]
    fn migrations_are_versioned_upwards_without_gaps_or_repeats() {
        let mut versions: Vec<i64> = migrations().iter().map(|m| m.version).collect();
        let count = versions.len();
        versions.sort_unstable();
        versions.dedup();

        assert_eq!(versions.len(), count, "duplicate migration version");
        for (index, version) in versions.iter().enumerate() {
            assert_eq!(*version, index as i64 + 1, "migration versions must start at 1 and be contiguous");
        }
        assert!(migrations()
            .iter()
            .all(|m| matches!(m.kind, MigrationKind::Up)));
    }
}
