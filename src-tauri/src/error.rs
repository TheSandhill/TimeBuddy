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

    /// The export file could not be built or written — a full disk, a path in
    /// a folder that has since gone, a workbook Excel would refuse.
    ///
    /// Separate from `Database` because the two say different things to the
    /// person watching: their hours are safe, the file is not there.
    #[error("export failed: {message}")]
    Export { message: String },

    /// Registering — or unregistering — TimeBuddy with Windows startup failed.
    ///
    /// Its own variant because it is the one setting that lives outside the
    /// database: the checkbox has to be able to say "Windows said no" rather
    /// than quietly showing a preference nothing acts on.
    #[error("autostart failed: {message}")]
    Autostart { message: String },
}

impl Error {
    pub fn validation(code: ValidationCode) -> Self {
        Error::Validation { code }
    }

    pub fn not_found(entity: &'static str, id: i64) -> Self {
        Error::NotFound { entity, id }
    }

    /// Written out at the point of failure rather than through a blanket
    /// `From<io::Error>`, so an unrelated I/O fault can never claim to be a
    /// failed export.
    pub fn export(cause: impl std::fmt::Display) -> Self {
        Error::Export {
            message: cause.to_string(),
        }
    }

    pub fn autostart(cause: impl std::fmt::Display) -> Self {
        Error::Autostart {
            message: cause.to_string(),
        }
    }
}

impl From<sqlx::Error> for Error {
    fn from(error: sqlx::Error) -> Self {
        Error::Database {
            message: error.to_string(),
        }
    }
}

impl From<rust_xlsxwriter::XlsxError> for Error {
    fn from(error: rust_xlsxwriter::XlsxError) -> Self {
        Error::Export {
            message: error.to_string(),
        }
    }
}


pub type Result<T> = std::result::Result<T, Error>;
