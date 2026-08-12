//! App configuration: exactly one row, created by the migration.
//!
//! Reading settings can therefore never miss — there is no "not yet configured"
//! state for the UI to handle, and no place for a second row to disagree.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::{AppHandle, Manager, Runtime, State};
use tauri_plugin_autostart::ManagerExt;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};
use crate::text;

/// The shipped themes (ADR-0004). An enum rather than a string so an unknown
/// theme is rejected at the boundary instead of leaving the UI unstyled.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "kebab-case")]
#[sqlx(rename_all = "kebab-case")]
pub enum Theme {
    Walnut,
    Sand,
    HighContrast,
}

/// UI languages. Dutch is the shipped default.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(rename_all = "lowercase")]
pub enum Language {
    Nl,
    En,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: Theme,
    /// When set, the OS light/dark preference wins over `theme`.
    pub follow_system: bool,
    pub language: Language,
    pub pomodoro_minutes: i64,
    pub break_minutes: i64,
    /// The soft chime at the edge of a block. On by default — it is the point
    /// of a timer you are not supposed to watch.
    pub chime_enabled: bool,
    /// Whether ending a block also raises a Windows notification.
    pub notifications_enabled: bool,
    /// Whether TimeBuddy registers itself to start with Windows. Off by
    /// default: an app that adds itself to startup uninvited is a nuisance.
    pub autostart: bool,
    /// Where daily backups are written. `None` means `backups` under the app's
    /// own data directory — a path resolved at runtime, not frozen in a row.
    pub backup_folder: Option<String>,
    pub updated_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT theme, follow_system, language, pomodoro_minutes, break_minutes, \
                      chime_enabled, notifications_enabled, autostart, backup_folder, \
                      updated_at FROM settings WHERE id = 1";

/// Generic over the executor rather than taking `&SqlitePool`, because the
/// restore swap reads this over a single connection it closes by hand — see
/// [`crate::db::connect_one`]. Every other caller still passes the pool.
pub async fn get<'e, E>(executor: E) -> Result<Settings>
where
    E: sqlx::Executor<'e, Database = sqlx::Sqlite>,
{
    // The row is seeded by migration 1, so its absence is a corrupt database
    // rather than a state the caller should have to handle.
    sqlx::query_as(SELECT)
        .fetch_optional(executor)
        .await?
        .ok_or_else(|| Error::not_found("settings", 1))
}

/// Replaces the whole row. Settings are edited on one screen and saved as a
/// unit, so a partial update would only invite half-applied states.
pub async fn update(pool: &SqlitePool, settings: &Settings, now: DateTime<Utc>) -> Result<Settings> {
    if settings.pomodoro_minutes <= 0 || settings.break_minutes <= 0 {
        return Err(Error::validation(ValidationCode::DurationSettingNotPositive));
    }

    // A folder someone cleared reads back as `None`, never as `""` — otherwise
    // "no folder chosen" would have two spellings and the backup job would have
    // to know both.
    let backup_folder = text::optional(settings.backup_folder.as_deref());

    sqlx::query(
        "UPDATE settings
            SET theme = ?, follow_system = ?, language = ?, pomodoro_minutes = ?,
                break_minutes = ?, chime_enabled = ?, notifications_enabled = ?,
                autostart = ?, backup_folder = ?, updated_at = ?
          WHERE id = 1",
    )
    .bind(settings.theme)
    .bind(settings.follow_system)
    .bind(settings.language)
    .bind(settings.pomodoro_minutes)
    .bind(settings.break_minutes)
    .bind(settings.chime_enabled)
    .bind(settings.notifications_enabled)
    .bind(settings.autostart)
    .bind(backup_folder)
    .bind(now)
    .execute(pool)
    .await?;

    get(pool).await
}

/// Makes Windows agree with the `autostart` column.
///
/// The registry is the truth Windows reads, and this row is the truth the app
/// reads; they are two places, so they are reconciled explicitly — here on
/// save, and again on launch, rather than trusted to have stayed in step.
pub fn apply_autostart<R: Runtime>(app: &impl Manager<R>, enabled: bool) -> Result<()> {
    let launcher = app.autolaunch();

    // Asking first keeps a re-save from rewriting a registry entry that already
    // says the right thing.
    if launcher.is_enabled().map_err(Error::autostart)? == enabled {
        return Ok(());
    }

    if enabled {
        launcher.enable().map_err(Error::autostart)
    } else {
        launcher.disable().map_err(Error::autostart)
    }
}

// -- Command layer ----------------------------------------------------------

#[tauri::command]
pub async fn get_settings(db: State<'_, Db>) -> Result<Settings> {
    get(&db.0).await
}

#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    db: State<'_, Db>,
    settings: Settings,
) -> Result<Settings> {
    // Windows first: if registering fails, the save has not happened either, so
    // the checkbox the user is looking at is still telling the truth.
    //
    // The other order of failure — registry written, row not — leaves the two
    // disagreeing until the next launch, which re-asserts the row onto Windows
    // and settles it. No rollback here, because a rollback that itself fails
    // would just be a third thing to get wrong.
    apply_autostart(&app, settings.autostart)?;
    update(&db.0, &settings, Utc::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_support::now;

    #[tokio::test]
    async fn a_fresh_database_already_has_usable_settings() {
        let pool = test_pool().await;

        let settings = get(&pool).await.unwrap();

        assert_eq!(settings.theme, Theme::Walnut, "Walnut is the default (ADR-0004)");
        assert!(!settings.follow_system);
        assert_eq!(settings.language, Language::Nl);
        assert_eq!(settings.pomodoro_minutes, 25);
        assert_eq!(settings.break_minutes, 5);
        assert!(settings.chime_enabled, "the chime is the point of the timer");
        assert!(settings.notifications_enabled);
        assert!(!settings.autostart, "nothing adds itself to Windows startup uninvited");
        assert_eq!(settings.backup_folder, None, "None means the app data dir");
    }

    #[tokio::test]
    async fn every_field_round_trips() {
        let pool = test_pool().await;

        let saved = update(
            &pool,
            &Settings {
                theme: Theme::HighContrast,
                follow_system: true,
                language: Language::En,
                pomodoro_minutes: 50,
                break_minutes: 10,
                chime_enabled: false,
                notifications_enabled: false,
                autostart: true,
                backup_folder: Some("D:\\OneDrive\\TimeBuddy".to_string()),
                updated_at: now(),
            },
            now(),
        )
        .await
        .unwrap();

        assert_eq!(saved.theme, Theme::HighContrast);
        assert!(saved.follow_system);
        assert_eq!(saved.language, Language::En);
        assert_eq!(saved.pomodoro_minutes, 50);
        assert_eq!(saved.break_minutes, 10);
        assert!(!saved.chime_enabled);
        assert!(!saved.notifications_enabled);
        assert!(saved.autostart);
        assert_eq!(
            saved.backup_folder,
            Some("D:\\OneDrive\\TimeBuddy".to_string())
        );
        assert_eq!(get(&pool).await.unwrap(), saved);
    }

    #[tokio::test]
    async fn a_cleared_backup_folder_reads_back_as_absent() {
        let pool = test_pool().await;
        let base = get(&pool).await.unwrap();

        let chosen = update(
            &pool,
            &Settings {
                backup_folder: Some("  D:\\Backups  ".to_string()),
                ..base.clone()
            },
            now(),
        )
        .await
        .unwrap();
        assert_eq!(
            chosen.backup_folder,
            Some("D:\\Backups".to_string()),
            "a pasted path keeps no stray whitespace"
        );

        // Clearing the field must not leave `""` behind for the backup job to
        // treat as a folder named nothing.
        let cleared = update(
            &pool,
            &Settings {
                backup_folder: Some("   ".to_string()),
                ..base
            },
            now(),
        )
        .await
        .unwrap();
        assert_eq!(cleared.backup_folder, None);
    }

    #[tokio::test]
    async fn a_timer_length_of_zero_is_rejected() {
        let pool = test_pool().await;
        let base = get(&pool).await.unwrap();

        for candidate in [
            Settings {
                pomodoro_minutes: 0,
                ..base.clone()
            },
            Settings {
                break_minutes: -5,
                ..base.clone()
            },
        ] {
            let error = update(&pool, &candidate, now()).await.unwrap_err();
            assert!(matches!(
                error,
                Error::Validation {
                    code: ValidationCode::DurationSettingNotPositive
                }
            ));
        }

        assert_eq!(get(&pool).await.unwrap(), base, "a rejected save changes nothing");
    }

    #[tokio::test]
    async fn updating_stamps_the_row() {
        let pool = test_pool().await;
        let before = get(&pool).await.unwrap();

        let after = update(&pool, &before, now()).await.unwrap();

        assert_eq!(after.updated_at, now());
        assert_ne!(before.updated_at, after.updated_at);
    }
}
