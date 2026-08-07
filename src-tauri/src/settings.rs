//! App configuration: exactly one row, created by the migration.
//!
//! Reading settings can therefore never miss — there is no "not yet configured"
//! state for the UI to handle, and no place for a second row to disagree.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};

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
    pub updated_at: DateTime<Utc>,
}

const SELECT: &str = "SELECT theme, follow_system, language, pomodoro_minutes, break_minutes, \
                      updated_at FROM settings WHERE id = 1";

pub async fn get(pool: &SqlitePool) -> Result<Settings> {
    // The row is seeded by migration 1, so its absence is a corrupt database
    // rather than a state the caller should have to handle.
    sqlx::query_as(SELECT)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| Error::not_found("settings", 1))
}

/// Replaces the whole row. Settings are edited on one screen and saved as a
/// unit, so a partial update would only invite half-applied states.
pub async fn update(pool: &SqlitePool, settings: &Settings, now: DateTime<Utc>) -> Result<Settings> {
    if settings.pomodoro_minutes <= 0 || settings.break_minutes <= 0 {
        return Err(Error::validation(ValidationCode::DurationSettingNotPositive));
    }

    sqlx::query(
        "UPDATE settings
            SET theme = ?, follow_system = ?, language = ?, pomodoro_minutes = ?,
                break_minutes = ?, updated_at = ?
          WHERE id = 1",
    )
    .bind(settings.theme)
    .bind(settings.follow_system)
    .bind(settings.language)
    .bind(settings.pomodoro_minutes)
    .bind(settings.break_minutes)
    .bind(now)
    .execute(pool)
    .await?;

    get(pool).await
}

// -- Command layer ----------------------------------------------------------

#[tauri::command]
pub async fn get_settings(db: State<'_, Db>) -> Result<Settings> {
    get(&db.0).await
}

#[tauri::command]
pub async fn update_settings(db: State<'_, Db>, settings: Settings) -> Result<Settings> {
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
        assert_eq!(get(&pool).await.unwrap(), saved);
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
