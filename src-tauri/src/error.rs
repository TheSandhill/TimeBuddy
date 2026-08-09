//! The error type every command returns.
//!
//! Validation failures carry a **code**, not a sentence. UI copy is Dutch and
//! English and lives in the i18n catalogues — a Rust string would be a
//! hardcoded UI string in the one place the lint can't see it.

use serde::Serialize;

/// Why an input was rejected. One variant per rule in `CONTEXT.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ValidationCode {
    /// A required name was empty or only whitespace.
    NameRequired,
    /// `duration_minutes <= 0`.
    DurationNotPositive,
    /// `duration_minutes > 1440` — more than a day of work in one entry.
    DurationExceedsDay,
    /// The entry is dated after today. Hours can't be logged in advance.
    DateInFuture,
    /// A report's range ends before it starts.
    RangeEndsBeforeStart,
    /// A pomodoro or break length was zero or negative.
    DurationSettingNotPositive,
    /// A Pomodoro Block was started while one was already in flight. There is
    /// at most one Running Timer, and silently replacing it would drop work.
    TimerAlreadyRunning,
}

/// Anything a command can fail with.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Error {
    #[error("validation failed: {code:?}")]
    Validation { code: ValidationCode },

    #[error("{entity} {id} not found")]
    NotFound { entity: &'static str, id: i64 },

    /// A database fault. Not actionable by the user, so it carries a message
    /// for the log rather than a code for translation.
    #[error("database error: {message}")]
    Database { message: String },
}

impl Error {
    pub fn validation(code: ValidationCode) -> Self {
        Error::Validation { code }
    }

    pub fn not_found(entity: &'static str, id: i64) -> Self {
        Error::NotFound { entity, id }
    }
}

impl From<sqlx::Error> for Error {
    fn from(error: sqlx::Error) -> Self {
        Error::Database {
            message: error.to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;
