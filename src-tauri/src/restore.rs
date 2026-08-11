//! Putting a backup back.
//!
//! ADR-0007 said there would be no restore, on the grounds that copying one file
//! back is a thing a person can do without this app's help. ADR-0008 amends it:
//! by hand it means finding `%APPDATA%`, renaming a UTC stamp to `timebuddy.db`,
//! and quitting from the tray first — because close only hides (ADR-0004), and
//! someone who closes the window and swaps the file is swapping a file SQLite
//! still has open.
//!
//! A restore is therefore **two launches**:
//!
//! 1. [`stage`] verifies the chosen backup and copies it beside the database as
//!    `restore-pending-<stamp>.db`. Nothing is destroyed, and the file's presence
//!    is the only record that a restore is owed — a row could disagree with it.
//! 2. [`take_staged`] runs at the next launch, before the pool opens and before
//!    the sql plugin migrates anything. It verifies again, copies the present
//!    aside as an ordinary backup, and swaps.
//!
//! Nothing here reaches the live pool, because at the moment that matters there
//! is no live pool: the swap happens before one exists.

use std::path::{Path, PathBuf};

use chrono::{DateTime, NaiveDateTime, Utc};
use serde::Serialize;
use sqlx::sqlite::SqliteConnectOptions;
use sqlx::{Connection, Row, SqliteConnection, SqlitePool};
use tauri::{AppHandle, Manager, Runtime, State};

use crate::backup;
use crate::db::{self, Db};
use crate::error::{Error, Result, ValidationCode};
use crate::schema;
use crate::settings;

/// The staged file's name, minus the stamp of the backup it holds.
///
/// The stamp is carried in the name rather than in a sidecar for the same reason
/// the backup folder is the record: one place, so nothing can disagree. It is
/// also what lets the swap say *which day* it restored from, after the original
/// name is gone.
const PENDING_PREFIX: &str = "restore-pending-";
const PENDING_SUFFIX: &str = ".db";

/// Where the database being replaced is parked for the length of the swap.
///
/// Windows `rename` will not overwrite, so the swap is two renames rather than
/// one: the present steps aside, the restore takes its place, and only then is
/// the present deleted. An interruption anywhere in there leaves a whole
/// database somewhere, never half of one in place.
const DISPLACED: &str = "restore-replaced.db";

/// The tables the app reads. A file that has none of them is not this app's
/// database, however well-formed it is — and a backup truncated to zero bytes is
/// a *valid empty* SQLite database, which is exactly the trap this closes.
const REQUIRED_TABLES: [&str; 4] = ["clients", "projects", "time_entries", "settings"];

/// A backup offered as something to go back to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorableBackup {
    /// The file's own name, which is also the handle the commands take. Never a
    /// path: only names matching a backup's pattern can be staged.
    pub file_name: String,
    /// When it was made, parsed out of that name.
    pub made_at: DateTime<Utc>,
}

/// What restoring a particular backup would cost, in the words of what is lost.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub file_name: String,
    /// The day the restore is from.
    pub made_at: DateTime<Utc>,
    /// Entries logged since then, in the database as it stands. These are what
    /// the restore discards, and saying "12 entries" is the honest warning.
    pub entries_since: i64,
    /// Their total, so the warning can be read in hours rather than in rows.
    pub minutes_since: i64,
}

/// Why a staged restore did not happen. A code, not a sentence — the wording is
/// Dutch and English and lives in the catalogues.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum RestoreFault {
    /// The staged file no longer verified. A synced folder can rot between the
    /// choosing and the launch, which is why it is checked twice.
    StagedFileRejected,
    /// The present could not be copied aside, so nothing was swapped. Refusing
    /// is the point: a restore that discards the present can only be run once.
    SafetyCopyFailed,
    /// The files themselves could not be moved.
    SwapFailed,
}

/// What the launch did about a staged restore. Read once, by the app shell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum Outcome {
    /// Nothing was staged — the overwhelmingly common launch.
    Nothing,
    /// The swap happened. The password is now the one from that day, so the app
    /// re-locks and says so (ADR-0008).
    Done {
        restored_from: DateTime<Utc>,
        /// Where the present went, so "undo this" is a file the user can name.
        safety_copy: String,
    },
    /// The swap did not happen, and the database on disk is the one that was
    /// already there. Announced rather than passed over: opening on old data in
    /// silence would read as the restore having worked.
    Failed { fault: RestoreFault },
}

/// Managed state. Filled once at launch, before the window exists, and read by
/// the shell — the swap is over long before anything can ask about it.
pub struct RestoreReport(pub Outcome);

// -- Naming -----------------------------------------------------------------

fn pending_name(at: DateTime<Utc>) -> String {
    format!("{PENDING_PREFIX}{}{PENDING_SUFFIX}", at.format(backup::STAMP))
}

fn staged_at(name: &str) -> Option<DateTime<Utc>> {
    let stamp = name
        .strip_prefix(PENDING_PREFIX)?
        .strip_suffix(PENDING_SUFFIX)?;

    NaiveDateTime::parse_from_str(stamp, backup::STAMP)
        .ok()
        .map(|naive| naive.and_utc())
}

/// The staged restore in `data_dir`, newest first.
///
/// A list rather than an option because there is a way to end up with two — a
/// staging that was interrupted between writing and clearing — and the swap
/// should take the newest and sweep the rest rather than pick arbitrarily.
fn staged(data_dir: &Path) -> Vec<(DateTime<Utc>, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(data_dir) else {
        return Vec::new();
    };

    let mut found: Vec<(DateTime<Utc>, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| Some((staged_at(entry.file_name().to_str()?)?, entry.path())))
        .collect();

    found.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    found
}

// -- Verification -----------------------------------------------------------

/// Whether `path` is a database this build can open and migrate forward.
///
/// Run **twice** on purpose (ADR-0008): once when a backup is chosen, so the
/// answer is immediate, and again at launch before anything is overwritten. The
/// second is the one that actually guards the swap; a file in a half-synced
/// OneDrive folder can be whole at the first and truncated at the second.
async fn verify(path: &Path, latest: i64) -> Result<()> {
    if !path.is_file() {
        return Err(Error::validation(ValidationCode::BackupUnreadable));
    }

    // `create_if_missing` is off and the connection is read-only: verifying a
    // backup must not be able to write to it, and must not conjure one.
    let mut connection = SqliteConnection::connect_with(
        &SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(false)
            .read_only(true),
    )
    .await
    .map_err(|_| Error::validation(ValidationCode::BackupUnreadable))?;

    let verdict = inspect(&mut connection, latest).await;

    // Closed on **every** path, which is why the checks are a function of their
    // own rather than a run of early returns. Dropping a connection only
    // schedules its close, and on Windows a handle that outlives the drop is a
    // handle that refuses the delete or the rename this was clearing the way
    // for — a file we have just decided is bad has to be removable.
    let _ = connection.close().await;
    verdict
}

/// The checks themselves, so [`verify`] can own closing the connection.
async fn inspect(connection: &mut SqliteConnection, latest: i64) -> Result<()> {
    // Bytes that were never a database fail here, and so does a file whose
    // header survived a half-finished upload while its pages did not.
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut *connection)
        .await
        .map_err(|_| Error::validation(ValidationCode::BackupUnreadable))?;

    if integrity != "ok" {
        return Err(Error::validation(ValidationCode::BackupUnreadable));
    }

    // An empty file is a valid empty database, so "it opened" is not enough.
    for table in REQUIRED_TABLES {
        let present: Option<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
                .bind(table)
                .fetch_optional(&mut *connection)
                .await
                .map_err(|_| Error::validation(ValidationCode::BackupUnreadable))?;

        if present.is_none() {
            return Err(Error::validation(ValidationCode::BackupUnreadable));
        }
    }

    // Older is fine — the plugin migrates it forward after the swap. Newer is
    // not: nothing migrates backward.
    if applied_version(connection).await > latest {
        return Err(Error::validation(ValidationCode::BackupFromNewerVersion));
    }

    Ok(())
}

/// The highest migration applied to the database on `connection`.
///
/// `tauri-plugin-sql` keeps its history in `_sqlx_migrations`. A backup made
/// before that table existed — or by the tests, which apply the same SQL
/// directly — reads as 0, which is "older than anything" and therefore fine.
async fn applied_version(connection: &mut SqliteConnection) -> i64 {
    sqlx::query("SELECT MAX(version) FROM _sqlx_migrations")
        .fetch_one(connection)
        .await
        .ok()
        .and_then(|row| row.try_get::<Option<i64>, _>(0).ok().flatten())
        .unwrap_or(0)
}

// -- Reading ----------------------------------------------------------------

/// The backups in `folder`, newest first, as things that can be gone back to.
///
/// Off the same listing rotation uses, so what is offered and what is kept can
/// never be two different sets of files.
pub fn restorable(folder: &Path) -> Vec<RestorableBackup> {
    backup::existing(folder)
        .into_iter()
        .filter_map(|(made_at, path)| {
            Some(RestorableBackup {
                file_name: path.file_name()?.to_str()?.to_owned(),
                made_at,
            })
        })
        .collect()
}

/// What restoring `file_name` would discard, counted in the live database.
///
/// `created_at` rather than `date`: the question is what has been *logged* since
/// the backup, and an entry typed today for last Tuesday goes with the restore
/// just the same.
pub async fn preview(pool: &SqlitePool, file_name: &str) -> Result<RestorePreview> {
    let made_at = backup::made_at(file_name)
        .ok_or_else(|| Error::validation(ValidationCode::NotABackup))?;

    // `made_at` is bound as an instant, not as a string this module formatted:
    // the comparison is against `created_at`, and both sides have to be spelled
    // by the same encoder or a text comparison would quietly go wrong.
    let (entries_since, minutes_since): (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*), COALESCE(SUM(duration_minutes), 0)
           FROM time_entries
          WHERE created_at > ?",
    )
    .bind(made_at)
    .fetch_one(pool)
    .await?;

    Ok(RestorePreview {
        file_name: file_name.to_owned(),
        made_at,
        entries_since,
        minutes_since,
    })
}

// -- Staging ----------------------------------------------------------------

/// Verifies `file_name` in `folder` and stages it beside the database.
///
/// `file_name`, never a path: [`backup::made_at`] is the gate, so `..\` and an
/// arbitrary file on disk are not things that can be staged.
///
/// Copied rather than `VACUUM INTO`'d — the source is not open by anyone here,
/// and it is already the consistent snapshot `VACUUM INTO` made it.
pub async fn stage(folder: &Path, file_name: &str, data_dir: &Path, latest: i64) -> Result<()> {
    let made_at = backup::made_at(file_name)
        .ok_or_else(|| Error::validation(ValidationCode::NotABackup))?;

    let chosen = folder.join(file_name);
    verify(&chosen, latest).await?;

    // Staged into the app's own directory, not the backup folder: that one is
    // usually synced, and staging into a folder something else is uploading is
    // asking for the swap to read a partial copy.
    std::fs::create_dir_all(data_dir).map_err(Error::restore)?;

    // Last choice wins. Two staged files would otherwise mean the swap picking
    // between them, and the one the user just asked for is the answer.
    cancel(data_dir)?;

    std::fs::copy(&chosen, data_dir.join(pending_name(made_at))).map_err(Error::restore)?;
    Ok(())
}

/// Clears any staged restore. What "never mind" does, before the relaunch.
pub fn cancel(data_dir: &Path) -> Result<()> {
    for (_, path) in staged(data_dir) {
        std::fs::remove_file(&path).map_err(Error::restore)?;
    }
    Ok(())
}

/// The staged restore waiting for a relaunch, if there is one.
pub fn pending(data_dir: &Path) -> Option<DateTime<Utc>> {
    staged(data_dir).first().map(|(at, _)| *at)
}

// -- The swap ---------------------------------------------------------------

/// Performs a staged restore, if one is staged.
///
/// Called at launch **before the pool opens and before the sql plugin
/// migrates**, which is why it takes paths rather than state: at the moment this
/// runs, none of the app exists yet.
///
/// Every failure leaves the current database in place and says so. The order is
/// what makes that true — verify, then copy the present aside, then swap — so
/// nothing is overwritten until the thing overwriting it has been read and the
/// thing being overwritten has been saved.
pub async fn take_staged(data_dir: &Path, db_file: &Path, latest: i64) -> Outcome {
    let mut found = staged(data_dir);
    if found.is_empty() {
        return Outcome::Nothing;
    }

    // Newest wins, and the rest go — an interrupted staging should not leave a
    // file that gets restored on some later launch nobody connected it to.
    let (made_at, path) = found.remove(0);
    for (_, extra) in found {
        let _ = std::fs::remove_file(extra);
    }

    // Checked again, because the first check was before a sync client had the
    // rest of the night with this file.
    if verify(&path, latest).await.is_err() {
        // A file known to be bad is removed rather than kept: keeping it would
        // be a restore that fails identically on every launch, forever.
        let _ = std::fs::remove_file(&path);
        return Outcome::Failed {
            fault: RestoreFault::StagedFileRejected,
        };
    }

    let safety_copy = match copy_present_aside(data_dir, db_file).await {
        Ok(name) => name,
        Err(_) => {
            // The staged file stays. The backup folder being unreachable is a
            // thing the user can fix, and then this launch's restore is still
            // the one they asked for.
            return Outcome::Failed {
                fault: RestoreFault::SafetyCopyFailed,
            };
        }
    };

    match swap(data_dir, db_file, &path) {
        Ok(()) => Outcome::Done {
            restored_from: made_at,
            safety_copy,
        },
        Err(_) => Outcome::Failed {
            fault: RestoreFault::SwapFailed,
        },
    }
}

/// Copies the database being replaced into the backup folder, as an ordinary
/// backup, and hands back the name it was filed under.
///
/// An ordinary one on purpose (ADR-0008): it counts against the seven, and it
/// appears in the same list everything else does — so undoing a restore is the
/// same act as making one.
///
/// The pool is short-lived and **closed before the swap**. The file about to be
/// replaced must not be open at the moment it is replaced, and `VACUUM INTO` is
/// the only way to copy one that might have a WAL beside it.
async fn copy_present_aside(data_dir: &Path, db_file: &Path) -> Result<String> {
    // Nothing to save. A staged restore onto an install with no database is odd
    // but harmless, and refusing it would strand the restore.
    if !db_file.is_file() {
        return Ok(String::new());
    }

    let pool = db::connect(db_file).await?;

    let folder = settings::get(&pool)
        .await
        .map(|settings| backup::resolve_folder(settings.backup_folder.as_deref(), data_dir))
        // A database whose settings row cannot be read still deserves a copy —
        // into the default folder, which needs nothing from it.
        .unwrap_or_else(|_| backup::resolve_folder(None, data_dir));

    let now = Utc::now();
    let written = backup::run(&pool, &folder, now).await;

    // Closed whether or not the copy worked: the swap is next either way, and a
    // pool left open would be a handle on the file it is about to move.
    pool.close().await;

    written.map(|_| backup::file_name(now))
}

/// Moves the staged file into place.
///
/// Two renames rather than one, because Windows `rename` will not overwrite.
/// The `-wal` and `-shm` sidecars of the replaced database go with it: a WAL
/// belonging to a different database is not a recovery, it is corruption.
fn swap(data_dir: &Path, db_file: &Path, staged_file: &Path) -> Result<()> {
    let displaced = data_dir.join(DISPLACED);
    let _ = std::fs::remove_file(&displaced);

    if db_file.is_file() {
        std::fs::rename(db_file, &displaced).map_err(Error::restore)?;
    }

    // The one irreversible instant, and it is a rename on one volume: either the
    // restore is in place or the present still is, never half of each.
    if let Err(error) = std::fs::rename(staged_file, db_file) {
        // Put back what was moved aside, so a failure here is not the one thing
        // this whole module exists to prevent.
        let _ = std::fs::rename(&displaced, db_file);
        return Err(Error::restore(error));
    }

    for sidecar in ["-wal", "-shm"] {
        let mut name = db_file.as_os_str().to_owned();
        name.push(sidecar);
        let _ = std::fs::remove_file(PathBuf::from(name));
    }

    let _ = std::fs::remove_file(&displaced);
    Ok(())
}

// -- Command layer ----------------------------------------------------------

/// The backup folder this machine and the settings row agree on.
async fn folder_for<R: Runtime>(app: &impl Manager<R>, pool: &SqlitePool) -> Result<PathBuf> {
    let settings = settings::get(pool).await?;
    let data_dir = app.path().app_config_dir().map_err(Error::restore)?;
    Ok(backup::resolve_folder(
        settings.backup_folder.as_deref(),
        &data_dir,
    ))
}

#[tauri::command]
pub async fn list_restorable_backups(
    app: AppHandle,
    db: State<'_, Db>,
) -> Result<Vec<RestorableBackup>> {
    let folder = folder_for(&app, &db.0).await?;
    Ok(restorable(&folder))
}

#[tauri::command]
pub async fn preview_restore(db: State<'_, Db>, file_name: String) -> Result<RestorePreview> {
    preview(&db.0, &file_name).await
}

/// Verifies and stages. The relaunch is what actually restores.
#[tauri::command]
pub async fn stage_restore(app: AppHandle, db: State<'_, Db>, file_name: String) -> Result<()> {
    let folder = folder_for(&app, &db.0).await?;
    let data_dir = app.path().app_config_dir().map_err(Error::restore)?;

    stage(&folder, &file_name, &data_dir, schema::latest_version()).await
}

#[tauri::command]
pub fn cancel_restore(app: AppHandle) -> Result<()> {
    let data_dir = app.path().app_config_dir().map_err(Error::restore)?;
    cancel(&data_dir)
}

/// When the staged restore is from, or `null` when none is waiting.
#[tauri::command]
pub fn pending_restore(app: AppHandle) -> Result<Option<DateTime<Utc>>> {
    let data_dir = app.path().app_config_dir().map_err(Error::restore)?;
    Ok(pending(&data_dir))
}

/// What this launch did about a staged restore. The shell asks once.
#[tauri::command]
pub fn restore_outcome(report: State<'_, RestoreReport>) -> Outcome {
    report.0.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients;
    use crate::db::test_file_pool;
    use crate::projects;
    use crate::test_support::{at, now, today};
    use crate::time_entries::{self, NewTimeEntry, Source};
    use std::path::PathBuf;
    use tempfile::TempDir;

    /// A live database in a real file, a backup folder, and the app directory
    /// the two share. Mirrors the layout at runtime: `timebuddy.db` and any
    /// staged restore sit in `data_dir`, backups in a folder of their own.
    struct Install {
        _root: TempDir,
        data_dir: PathBuf,
        db_file: PathBuf,
        folder: PathBuf,
        pool: SqlitePool,
    }

    async fn install() -> Install {
        let root = tempfile::tempdir().unwrap();
        let data_dir = root.path().join("TimeBuddy");
        std::fs::create_dir_all(&data_dir).unwrap();
        let db_file = data_dir.join("timebuddy.db");
        let folder = root.path().join("backups");
        let pool = test_file_pool(&db_file).await;

        Install {
            _root: root,
            data_dir,
            db_file,
            folder,
            pool,
        }
    }

    /// Logs an hour against a fresh project, so a database has hours in it.
    async fn log_an_hour(pool: &SqlitePool, client: &str) {
        let owner = clients::create(pool, client, None, now()).await.unwrap();
        let project = projects::create(pool, owner.id, "Work", None, now())
            .await
            .unwrap();

        time_entries::create(
            pool,
            NewTimeEntry {
                project_id: project.id,
                date: today(),
                duration_minutes: 60,
                start_at: None,
                end_at: None,
                note: None,
                source: Source::Manual,
            },
            today(),
            now(),
        )
        .await
        .unwrap();
    }

    /// The client names in the database at `path`. What a restore is judged by.
    ///
    /// Opened rather than migrated: these files are already migrated, and
    /// `test_file_pool` would try to apply migration 1 to a database that has it.
    async fn clients_in(path: &Path) -> Vec<String> {
        let pool = db::connect(path).await.expect("a database is there");
        let names: Vec<(String,)> = sqlx::query_as("SELECT name FROM clients ORDER BY name")
            .fetch_all(&pool)
            .await
            .expect("and it holds the schema");
        pool.close().await;
        names.into_iter().map(|(name,)| name).collect()
    }

    fn latest() -> i64 {
        schema::latest_version()
    }

    #[tokio::test]
    async fn the_hours_from_the_chosen_day_are_the_hours_after_a_restore() {
        // The whole feature, end to end: a backup taken while only Acme existed,
        // work done afterwards for someone else, and a restore that puts the
        // first state back.
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        backup::run(&it.pool, &it.folder, at("2026-08-01T09:00:00Z"))
            .await
            .unwrap();

        log_an_hour(&it.pool, "Later Client").await;
        assert_eq!(clients_in(&it.db_file).await.len(), 2);

        let chosen = backup::file_name(at("2026-08-01T09:00:00Z"));
        stage(&it.folder, &chosen, &it.data_dir, latest())
            .await
            .unwrap();

        // Staging alone changes nothing. The restore is the relaunch.
        assert_eq!(clients_in(&it.db_file).await.len(), 2, "staging is not a swap");
        assert_eq!(pending(&it.data_dir), Some(at("2026-08-01T09:00:00Z")));

        // The pool the app had open is gone by the time the next launch runs.
        it.pool.close().await;
        let outcome = take_staged(&it.data_dir, &it.db_file, latest()).await;

        assert!(
            matches!(
                outcome,
                Outcome::Done { restored_from, .. } if restored_from == at("2026-08-01T09:00:00Z")
            ),
            "got {outcome:?}"
        );
        assert_eq!(
            clients_in(&it.db_file).await,
            vec!["Acme".to_string()],
            "the database is the one from the chosen day"
        );
        assert_eq!(pending(&it.data_dir), None, "and the staged file is spent");
    }

    #[tokio::test]
    async fn the_present_is_copied_aside_so_a_restore_can_be_run_twice() {
        // The safety copy is the difference between a restore and a one-way
        // door. Restoring back to Monday must leave today recoverable.
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        backup::run(&it.pool, &it.folder, at("2026-08-01T09:00:00Z"))
            .await
            .unwrap();
        log_an_hour(&it.pool, "Today's Client").await;

        // The backup folder is not the default one, so this also proves the
        // safety copy follows the settings row rather than a hardcoded path.
        settings::update(
            &it.pool,
            &settings::Settings {
                backup_folder: Some(it.folder.display().to_string()),
                ..settings::get(&it.pool).await.unwrap()
            },
            now(),
        )
        .await
        .unwrap();

        stage(
            &it.folder,
            &backup::file_name(at("2026-08-01T09:00:00Z")),
            &it.data_dir,
            latest(),
        )
        .await
        .unwrap();
        it.pool.close().await;

        let outcome = take_staged(&it.data_dir, &it.db_file, latest()).await;
        let Outcome::Done { safety_copy, .. } = &outcome else {
            panic!("expected a restore, got {outcome:?}");
        };

        // The copy is an ordinary backup: in the same folder, under the same
        // naming, and therefore in the same list — which is how a restore is
        // undone (ADR-0008).
        let saved = it.folder.join(safety_copy);
        assert!(saved.is_file(), "the present was copied aside");
        assert!(
            clients_in(&saved).await.contains(&"Today's Client".to_string()),
            "and the copy holds what the restore discarded"
        );
        assert!(
            restorable(&it.folder)
                .iter()
                .any(|candidate| &candidate.file_name == safety_copy),
            "so it is offered back like any other backup"
        );
    }

    #[tokio::test]
    async fn a_truncated_backup_is_refused_with_the_database_untouched() {
        // The named failure: a half-synced OneDrive folder. The file's name is
        // perfect and its contents are not.
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        backup::run(&it.pool, &it.folder, now()).await.unwrap();

        let chosen = backup::file_name(now());
        let whole = std::fs::read(it.folder.join(&chosen)).unwrap();
        std::fs::write(it.folder.join(&chosen), &whole[..whole.len() / 3]).unwrap();

        let refused = stage(&it.folder, &chosen, &it.data_dir, latest())
            .await
            .unwrap_err();

        assert!(matches!(
            refused,
            Error::Validation {
                code: ValidationCode::BackupUnreadable
            }
        ));
        assert_eq!(pending(&it.data_dir), None, "nothing was staged");
        it.pool.close().await;
        assert_eq!(
            clients_in(&it.db_file).await,
            vec!["Acme".to_string()],
            "and the current database is exactly where it was"
        );
    }

    #[tokio::test]
    async fn an_empty_file_is_a_valid_database_and_still_not_a_backup() {
        // Zero bytes opens as a perfectly consistent empty SQLite database, so
        // `integrity_check` alone would wave this through.
        let it = install().await;
        std::fs::create_dir_all(&it.folder).unwrap();
        let chosen = backup::file_name(now());
        std::fs::write(it.folder.join(&chosen), b"").unwrap();

        let refused = stage(&it.folder, &chosen, &it.data_dir, latest())
            .await
            .unwrap_err();

        assert!(matches!(
            refused,
            Error::Validation {
                code: ValidationCode::BackupUnreadable
            }
        ));
    }

    #[tokio::test]
    async fn a_backup_from_a_newer_version_is_refused() {
        // Nothing migrates backward, so a database from a later TimeBuddy would
        // be opened by code that does not know its columns.
        let it = install().await;
        std::fs::create_dir_all(&it.folder).unwrap();
        let chosen = backup::file_name(now());
        let path = it.folder.join(&chosen);

        let future = test_file_pool(&path).await;
        sqlx::raw_sql(
            "CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY);
             INSERT INTO _sqlx_migrations (version) VALUES (99);",
        )
        .execute(&future)
        .await
        .unwrap();
        future.close().await;

        let refused = stage(&it.folder, &chosen, &it.data_dir, latest())
            .await
            .unwrap_err();

        assert!(matches!(
            refused,
            Error::Validation {
                code: ValidationCode::BackupFromNewerVersion
            }
        ));
    }

    #[tokio::test]
    async fn a_backup_from_an_older_version_is_fine_because_the_plugin_migrates_forward() {
        let it = install().await;
        std::fs::create_dir_all(&it.folder).unwrap();
        let chosen = backup::file_name(now());
        let path = it.folder.join(&chosen);

        let old = test_file_pool(&path).await;
        sqlx::raw_sql(
            "CREATE TABLE _sqlx_migrations (version BIGINT PRIMARY KEY);
             INSERT INTO _sqlx_migrations (version) VALUES (1);",
        )
        .execute(&old)
        .await
        .unwrap();
        old.close().await;

        stage(&it.folder, &chosen, &it.data_dir, latest())
            .await
            .expect("older is what a backup usually is");
    }

    #[tokio::test]
    async fn a_staged_file_that_rotted_before_the_relaunch_is_refused_and_cleared() {
        // Verified twice for exactly this: whole when it was chosen, truncated
        // by the time the app restarted.
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        backup::run(&it.pool, &it.folder, now()).await.unwrap();
        stage(&it.folder, &backup::file_name(now()), &it.data_dir, latest())
            .await
            .unwrap();

        let staged_file = staged(&it.data_dir).remove(0).1;
        let whole = std::fs::read(&staged_file).unwrap();
        std::fs::write(&staged_file, &whole[..whole.len() / 3]).unwrap();

        it.pool.close().await;
        let outcome = take_staged(&it.data_dir, &it.db_file, latest()).await;

        assert_eq!(
            outcome,
            Outcome::Failed {
                fault: RestoreFault::StagedFileRejected
            },
            "and it says so rather than opening on old data in silence"
        );
        assert_eq!(
            clients_in(&it.db_file).await,
            vec!["Acme".to_string()],
            "the current database was never touched"
        );
        assert_eq!(
            pending(&it.data_dir),
            None,
            "a file known to be bad does not get retried every launch forever"
        );
    }

    #[tokio::test]
    async fn a_restore_that_cannot_copy_the_present_aside_does_not_happen() {
        // The backup folder is a file, standing in for a drive that has been
        // unplugged. Swapping anyway would be the one-way door.
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        backup::run(&it.pool, &it.folder, now()).await.unwrap();
        stage(&it.folder, &backup::file_name(now()), &it.data_dir, latest())
            .await
            .unwrap();

        let blocker = it.data_dir.join("blocked");
        std::fs::write(&blocker, b"a file, not a folder").unwrap();
        settings::update(
            &it.pool,
            &settings::Settings {
                backup_folder: Some(blocker.join("backups").display().to_string()),
                ..settings::get(&it.pool).await.unwrap()
            },
            now(),
        )
        .await
        .unwrap();
        it.pool.close().await;

        let outcome = take_staged(&it.data_dir, &it.db_file, latest()).await;

        assert_eq!(
            outcome,
            Outcome::Failed {
                fault: RestoreFault::SafetyCopyFailed
            }
        );
        assert_eq!(clients_in(&it.db_file).await, vec!["Acme".to_string()]);
        assert!(
            pending(&it.data_dir).is_some(),
            "the folder is fixable, so the restore the user asked for waits"
        );
    }

    #[tokio::test]
    async fn a_launch_with_nothing_staged_does_nothing() {
        let it = install().await;

        assert_eq!(
            take_staged(&it.data_dir, &it.db_file, latest()).await,
            Outcome::Nothing,
            "the overwhelmingly common launch"
        );
    }

    #[tokio::test]
    async fn only_a_name_this_app_wrote_can_be_staged() {
        // The gate that keeps `..\` and any file on disk off the list.
        let it = install().await;
        std::fs::create_dir_all(&it.folder).unwrap();

        for stranger in [
            "notes.txt",
            "timebuddy.db",
            "..\\timebuddy-20260805T120000Z.db",
            "../timebuddy-20260805T120000Z.db",
        ] {
            let refused = stage(&it.folder, stranger, &it.data_dir, latest())
                .await
                .unwrap_err();
            assert!(
                matches!(
                    refused,
                    Error::Validation {
                        code: ValidationCode::NotABackup
                    }
                ),
                "{stranger} is not ours to stage, got {refused:?}"
            );
        }
    }

    #[tokio::test]
    async fn staging_twice_leaves_the_one_that_was_asked_for_last() {
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        for day in ["2026-08-01T09:00:00Z", "2026-08-02T09:00:00Z"] {
            backup::run(&it.pool, &it.folder, at(day)).await.unwrap();
        }
        it.pool.close().await;

        for day in ["2026-08-02T09:00:00Z", "2026-08-01T09:00:00Z"] {
            stage(
                &it.folder,
                &backup::file_name(at(day)),
                &it.data_dir,
                latest(),
            )
            .await
            .unwrap();
        }

        assert_eq!(staged(&it.data_dir).len(), 1, "one restore is owed, not two");
        assert_eq!(pending(&it.data_dir), Some(at("2026-08-01T09:00:00Z")));
    }

    #[tokio::test]
    async fn cancelling_leaves_nothing_for_the_next_launch_to_find() {
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        backup::run(&it.pool, &it.folder, now()).await.unwrap();
        stage(&it.folder, &backup::file_name(now()), &it.data_dir, latest())
            .await
            .unwrap();

        cancel(&it.data_dir).unwrap();

        assert_eq!(pending(&it.data_dir), None);
        it.pool.close().await;
        assert_eq!(
            take_staged(&it.data_dir, &it.db_file, latest()).await,
            Outcome::Nothing
        );
    }

    #[tokio::test]
    async fn a_preview_counts_what_was_logged_after_the_backup_was_made() {
        // Said in the words of what is lost: the day, and the hours that go.
        let it = install().await;
        let owner = clients::create(&it.pool, "Acme", None, now()).await.unwrap();
        let project = projects::create(&it.pool, owner.id, "Work", None, now())
            .await
            .unwrap();

        let entry = |minutes: i64| NewTimeEntry {
            project_id: project.id,
            date: today(),
            duration_minutes: minutes,
            start_at: None,
            end_at: None,
            note: None,
            source: Source::Manual,
        };

        // Two entries created before the backup's stamp, two after. `created_at`
        // is what the preview counts on, so it is what these vary.
        let logged = |minutes: i64, when: &str| {
            time_entries::create(&it.pool, entry(minutes), today(), at(when))
        };

        logged(30, "2026-08-01T08:00:00Z").await.unwrap();
        logged(45, "2026-08-01T08:30:00Z").await.unwrap();
        logged(60, "2026-08-03T10:00:00Z").await.unwrap();
        logged(90, "2026-08-04T10:00:00Z").await.unwrap();

        let preview = preview(&it.pool, &backup::file_name(at("2026-08-02T09:00:00Z")))
            .await
            .unwrap();

        assert_eq!(preview.made_at, at("2026-08-02T09:00:00Z"));
        assert_eq!(preview.entries_since, 2);
        assert_eq!(preview.minutes_since, 150, "two and a half hours would go");
    }

    #[tokio::test]
    async fn a_preview_of_a_backup_with_nothing_logged_since_costs_nothing() {
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;

        let preview = preview(&it.pool, &backup::file_name(at("2026-08-09T09:00:00Z")))
            .await
            .unwrap();

        assert_eq!(preview.entries_since, 0);
        assert_eq!(preview.minutes_since, 0);
    }

    #[tokio::test]
    async fn the_restorable_list_is_the_backups_newest_first() {
        let it = install().await;
        log_an_hour(&it.pool, "Acme").await;
        for day in 1..=3 {
            backup::run(&it.pool, &it.folder, at(&format!("2026-08-0{day}T09:00:00Z")))
                .await
                .unwrap();
        }
        // The recommendation is a synced folder, so there are other things in it.
        std::fs::write(it.folder.join("notes.txt"), b"not ours").unwrap();
        it.pool.close().await;

        let offered = restorable(&it.folder);

        assert_eq!(offered.len(), 3, "only what this app wrote is offered back");
        assert_eq!(offered[0].made_at, at("2026-08-03T09:00:00Z"));
        assert_eq!(offered[0].file_name, backup::file_name(at("2026-08-03T09:00:00Z")));
        assert_eq!(offered[2].made_at, at("2026-08-01T09:00:00Z"));
    }

    #[test]
    fn the_replaced_databases_sidecars_do_not_survive_the_swap() {
        // A WAL belonging to a different database is not a recovery, it is
        // corruption — and the file is right there next to the one being moved.
        //
        // The move is tested on its own, with bytes rather than databases: what
        // is being pinned down is which files exist afterwards, and putting a
        // real SQLite file here would only add a WAL of its own making to the
        // question.
        let root = tempfile::tempdir().unwrap();
        let data_dir = root.path();
        let db_file = data_dir.join("timebuddy.db");
        let wal = data_dir.join("timebuddy.db-wal");
        let shm = data_dir.join("timebuddy.db-shm");

        std::fs::write(&db_file, b"the database that is leaving").unwrap();
        std::fs::write(&wal, b"its write-ahead log").unwrap();
        std::fs::write(&shm, b"its shared memory").unwrap();
        let staged_file = data_dir.join(pending_name(now()));
        std::fs::write(&staged_file, b"the restore").unwrap();

        swap(data_dir, &db_file, &staged_file).unwrap();

        assert_eq!(std::fs::read(&db_file).unwrap(), b"the restore");
        assert!(!wal.exists(), "the WAL went with the file it belonged to");
        assert!(!shm.exists(), "and so did the shared-memory file");
        assert!(!staged_file.exists(), "the staged copy was moved, not copied");
        assert!(
            !data_dir.join(DISPLACED).exists(),
            "and nothing is left parked halfway through"
        );
    }

    #[test]
    fn a_swap_onto_an_install_with_no_database_still_puts_one_there() {
        // Odd but harmless: a staged restore on an install whose database has
        // gone. Refusing would strand the restore for no gain.
        let root = tempfile::tempdir().unwrap();
        let data_dir = root.path();
        let db_file = data_dir.join("timebuddy.db");
        let staged_file = data_dir.join(pending_name(now()));
        std::fs::write(&staged_file, b"the restore").unwrap();

        swap(data_dir, &db_file, &staged_file).unwrap();

        assert_eq!(std::fs::read(&db_file).unwrap(), b"the restore");
    }

    #[test]
    fn a_staged_name_round_trips_through_its_stamp() {
        assert_eq!(pending_name(now()), "restore-pending-20260805T120000Z.db");
        assert_eq!(staged_at("restore-pending-20260805T120000Z.db"), Some(now()));
    }

    #[test]
    fn a_name_that_is_not_a_staged_restore_has_no_stamp() {
        for stranger in [
            "timebuddy.db",
            "timebuddy-20260805T120000Z.db",
            "restore-pending.db",
            "restore-replaced.db",
            "restore-pending-.db",
        ] {
            assert_eq!(staged_at(stranger), None, "{stranger} is not a staged restore");
        }
    }
}
