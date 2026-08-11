//! Daily copies of the database, and the rotation that keeps them from growing.
//!
//! A single SQLite file is one bad disk away from losing a year of billing
//! history, so this is the cheapest insurance the app has. Deliberately dumb:
//! a folder of dated copies of the whole file, the newest seven kept, no
//! incremental anything. Restoring is copying one file back by hand — which is
//! a thing a person can do without this app's help, and that is the point.
//!
//! The **folder is the record**. There is no `last_backup_at` column: the
//! newest file's own name is when the last backup succeeded, so the row and the
//! folder can never end up disagreeing about whether the data is safe.

use std::path::{Path, PathBuf};

use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use serde::Serialize;
use sqlx::SqlitePool;
use tauri::{AppHandle, Manager, Runtime, State};

use crate::db::Db;
use crate::error::{Error, Result};
use crate::settings;
use crate::text;

/// How many copies are kept. The eighth backup evicts the oldest.
///
/// Seven is a week: long enough that a corruption noticed on Friday can be
/// undone back to Monday, short enough that nobody's Dropbox notices.
pub const KEEP: usize = 7;

/// The name a backup carries, minus its stamp. Both halves are matched before
/// anything is deleted — see [`rotate`].
const PREFIX: &str = "timebuddy-";
const SUFFIX: &str = ".db";

/// The stamp inside the name, in UTC. Sortable as text, and — unlike a file's
/// mtime — it survives the file being copied somewhere else, which for a backup
/// is a thing that happens on purpose.
///
/// Shared with the staged-restore file, which carries the stamp of the backup it
/// holds so that the swap can say which day it restored from (ADR-0008).
pub const STAMP: &str = "%Y%m%dT%H%M%SZ";

/// Where backups go when no folder has been chosen: a `backups` folder beside
/// the database, rather than mixed in with it.
const DEFAULT_FOLDER: &str = "backups";

/// Past this, the app says out loud that the last backup is old. Two days
/// rather than one: a laptop that spent a day switched off is not a problem,
/// and a warning that cries every Monday is one nobody reads.
const STALE_AFTER: i64 = 2;

/// What the UI needs to say whether the hours are safe.
///
/// Every field is derived from the folder, in one read, so the count, the time
/// and the two verdicts can never describe different moments.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStatus {
    /// The resolved folder, shown so the user can go and look in it.
    pub folder: String,
    /// When the newest backup was made, or `None` when there are none.
    pub last_backup_at: Option<DateTime<Utc>>,
    /// How many backups are in the folder, at most [`KEEP`].
    pub kept: usize,
    /// No backup has been made today, so one is owed.
    pub due: bool,
    /// The newest backup is old enough to be worth a warning.
    pub stale: bool,
}

/// The name a backup made at `at` is filed under.
pub fn file_name(at: DateTime<Utc>) -> String {
    format!("{PREFIX}{}{SUFFIX}", at.format(STAMP))
}

/// When the backup called `name` was made, or `None` if this app did not make
/// it.
///
/// The gate that makes rotation safe: a folder the user shares with their own
/// files — a synced folder, which is the whole recommendation — must not have
/// anything deleted out of it that TimeBuddy did not put there.
///
/// It is the same gate on the way back in. A restore takes a *file name* and
/// asks this whether it is one of ours, which is what keeps `..\` and an
/// arbitrary path off the list of things that can be staged (ADR-0008).
pub fn made_at(name: &str) -> Option<DateTime<Utc>> {
    let stamp = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;

    // The trailing `Z` in the format is a literal, not an offset chrono can
    // read, so the stamp is parsed as the naive instant it is and named UTC —
    // which is what wrote it.
    NaiveDateTime::parse_from_str(stamp, STAMP)
        .ok()
        .map(|naive| naive.and_utc())
}

/// The backups already in `folder`, newest first.
///
/// A folder that is not there yields nothing rather than an error: an install
/// that has never backed up and a drive that has been unplugged both mean "no
/// backups here", and the difference shows up when one is *written* — loudly.
pub fn existing(folder: &Path) -> Vec<(DateTime<Utc>, PathBuf)> {
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };

    let mut found: Vec<(DateTime<Utc>, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let at = made_at(entry.file_name().to_str()?)?;
            Some((at, entry.path()))
        })
        .collect();

    // Newest first, so `first()` is the last successful backup and everything
    // past the seventh is what rotation evicts.
    found.sort_by_key(|(at, _)| std::cmp::Reverse(*at));
    found
}

/// Where backups go: the chosen folder, or `backups` under the app's own data
/// directory.
///
/// A blank setting is absent (`CONTEXT.md`), and absent resolves here, at
/// runtime — never into a row that would freeze one machine's path.
pub fn resolve_folder(setting: Option<&str>, data_dir: &Path) -> PathBuf {
    match text::optional(setting) {
        Some(chosen) => PathBuf::from(chosen),
        None => data_dir.join(DEFAULT_FOLDER),
    }
}

/// Reads the folder and answers whether the hours are safe.
pub fn status(folder: &Path, now: DateTime<Utc>) -> BackupStatus {
    let found = existing(folder);
    let last_backup_at = found.first().map(|(at, _)| *at);

    BackupStatus {
        folder: folder.display().to_string(),
        last_backup_at,
        kept: found.len(),
        // One a day. Compared as dates, not as elapsed hours, so a laptop
        // opened at nine every morning gets a backup every morning instead of
        // skipping every other day by twenty minutes.
        due: last_backup_at.is_none_or(|at| at.date_naive() < now.date_naive()),
        stale: last_backup_at.is_none_or(|at| now - at > Duration::days(STALE_AFTER)),
    }
}

/// Deletes everything past the newest [`KEEP`] backups.
///
/// Only files whose names this module wrote are candidates — see [`made_at`].
///
/// **Best effort.** A sync client holding the oldest file open is not a reason
/// to tell someone their backup failed when it did not; the copy they came for
/// is on disk either way, and the count on the Settings screen is where a folder
/// that has stopped shedding shows up.
fn rotate(folder: &Path) {
    for (_, path) in existing(folder).into_iter().skip(KEEP) {
        let _ = std::fs::remove_file(&path);
    }
}

/// Writes a backup into `folder` and rotates what is there.
///
/// The copy is made with SQLite's own `VACUUM INTO` rather than by copying the
/// file: the database is open and being written to, and a byte-for-byte copy
/// taken mid-transaction is a file that restores into a corrupt database. See
/// ADR-0007.
pub async fn run(pool: &SqlitePool, folder: &Path, now: DateTime<Utc>) -> Result<BackupStatus> {
    // Creating the folder is also the check that it can be reached at all: a
    // path on a drive that has been unplugged fails here, which is where the
    // caller wants to hear about it.
    std::fs::create_dir_all(folder).map_err(Error::backup)?;

    let path = folder.join(file_name(now));

    // `VACUUM INTO` refuses to overwrite, and a second backup inside the same
    // second is already the backup it would be making. Nothing to do is not a
    // failure to report.
    if !path.exists() {
        sqlx::query("VACUUM INTO ?")
            .bind(path.to_string_lossy().as_ref())
            .execute(pool)
            .await
            .map_err(Error::backup)?;
    }

    rotate(folder);
    Ok(status(folder, now))
}

// -- Command layer ----------------------------------------------------------

/// The folder the settings row and this machine agree on.
fn folder_for<R: Runtime>(app: &impl Manager<R>, setting: Option<&str>) -> Result<PathBuf> {
    let data_dir = app.path().app_config_dir().map_err(Error::backup)?;
    Ok(resolve_folder(setting, &data_dir))
}

#[tauri::command]
pub async fn backup_status(app: AppHandle, db: State<'_, Db>) -> Result<BackupStatus> {
    let settings = settings::get(&db.0).await?;
    let folder = folder_for(&app, settings.backup_folder.as_deref())?;

    Ok(status(&folder, Utc::now()))
}

/// Makes a backup now — the daily one the app owes, or the one the user asked
/// for by pressing the button. They are the same act, so there is one command.
#[tauri::command]
pub async fn run_backup(app: AppHandle, db: State<'_, Db>) -> Result<BackupStatus> {
    let settings = settings::get(&db.0).await?;
    let folder = folder_for(&app, settings.backup_folder.as_deref())?;

    run(&db.0, &folder, Utc::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clients;
    use crate::db::test_file_pool;
    use crate::test_support::{at, now};
    use sqlx::sqlite::SqliteConnectOptions;
    use std::collections::BTreeSet;
    use tempfile::TempDir;

    /// A live database in a real file, and an empty folder to back it up into.
    ///
    /// The `TempDir` is handed back so the caller keeps it alive: dropping it
    /// deletes the folder the assertions are about.
    async fn workspace() -> (TempDir, SqlitePool, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let pool = test_file_pool(&root.path().join("timebuddy.db")).await;
        let folder = root.path().join("backups");
        (root, pool, folder)
    }

    /// Opens a backup file, so a test can prove it is a database and not bytes.
    async fn open(path: &Path) -> SqlitePool {
        SqlitePool::connect_with(SqliteConnectOptions::new().filename(path))
            .await
            .expect("a backup is a database")
    }

    /// The names in a folder, sorted, so an assertion can name them.
    fn names(folder: &Path) -> BTreeSet<String> {
        std::fs::read_dir(folder)
            .expect("folder is there")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect()
    }

    #[tokio::test]
    async fn a_backup_is_a_database_holding_the_rows_that_were_there() {
        let (_root, pool, folder) = workspace().await;
        clients::create(&pool, "Acme", None, now()).await.unwrap();

        let status = run(&pool, &folder, now()).await.unwrap();

        assert_eq!(status.kept, 1);
        let copy = open(&folder.join(file_name(now()))).await;
        let (name,): (String,) = sqlx::query_as("SELECT name FROM clients")
            .fetch_one(&copy)
            .await
            .expect("the copy has the schema and the rows");
        assert_eq!(name, "Acme");
    }

    #[tokio::test]
    async fn the_eighth_backup_evicts_the_oldest() {
        let (_root, pool, folder) = workspace().await;

        let days: Vec<DateTime<Utc>> = (1..=8)
            .map(|day| at(&format!("2026-08-0{day}T09:00:00Z")))
            .collect();
        for day in &days {
            run(&pool, &folder, *day).await.unwrap();
        }

        let kept = names(&folder);
        assert_eq!(kept.len(), KEEP, "seven is the whole point of rotation");
        assert!(
            !kept.contains(&file_name(days[0])),
            "the oldest is the one that goes"
        );
        assert!(kept.contains(&file_name(days[7])), "and the newest stays");
    }

    #[tokio::test]
    async fn rotation_only_deletes_files_this_app_wrote() {
        // The recommendation is a synced folder — OneDrive, Dropbox — which is
        // a folder with other things in it. Rotation there must not be a
        // cleaner let loose on someone's documents.
        let (_root, pool, folder) = workspace().await;
        std::fs::create_dir_all(&folder).unwrap();
        for stranger in ["notes.txt", "timebuddy.db", "timebuddy-old.db"] {
            std::fs::write(folder.join(stranger), b"not ours").unwrap();
        }

        for day in 1..=8 {
            run(&pool, &folder, at(&format!("2026-08-0{day}T09:00:00Z")))
                .await
                .unwrap();
        }

        let kept = names(&folder);
        for stranger in ["notes.txt", "timebuddy.db", "timebuddy-old.db"] {
            assert!(kept.contains(stranger), "{stranger} was not ours to delete");
        }
        assert_eq!(kept.len(), KEEP + 3);
    }

    #[tokio::test]
    async fn a_folder_that_cannot_be_written_fails_out_loud() {
        // A drive that has been unplugged, spelled as a folder underneath a
        // file. Failing silently here is the whole thing this feature is
        // against: a backup nobody was told about is not a backup.
        let (root, pool, _folder) = workspace().await;
        let blocker = root.path().join("blocked");
        std::fs::write(&blocker, b"a file, not a folder").unwrap();

        let error = run(&pool, &blocker.join("backups"), now()).await.unwrap_err();

        assert!(matches!(error, Error::Backup { .. }));
    }

    #[tokio::test]
    async fn a_copy_that_could_not_be_swept_up_does_not_make_the_backup_a_failure() {
        // The oldest file is held open by a sync client. The copy the user came
        // for is on disk; saying "the backup failed" would be a lie, and the
        // wrong one to tell about backups.
        let (_root, pool, folder) = workspace().await;
        for day in 2..=8 {
            run(&pool, &folder, at(&format!("2026-08-0{day}T09:00:00Z")))
                .await
                .unwrap();
        }

        // Something wearing a backup's name that cannot be deleted as a file.
        // Standing in for what happens for real: a sync client with the oldest
        // copy open, on a folder we recommend precisely because it syncs.
        let stuck = folder.join(file_name(at("2026-08-01T09:00:00Z")));
        std::fs::create_dir(&stuck).unwrap();

        let status = run(&pool, &folder, at("2026-08-09T09:00:00Z"))
            .await
            .expect("the backup itself worked");

        assert!(stuck.exists(), "what could not be swept up is still there");
        // And the count says so out loud, so a folder that has stopped shedding
        // is visible rather than merely tolerated.
        assert_eq!(status.kept, KEEP + 1);
        assert!(
            !folder.join(file_name(at("2026-08-02T09:00:00Z"))).exists(),
            "one that could not go does not stop the next one going"
        );
    }

    #[tokio::test]
    async fn a_second_backup_in_the_same_second_is_not_an_error() {
        // Pressing "Back up now" twice is not a fault to report; the backup
        // that second would write is the one already sitting there.
        let (_root, pool, folder) = workspace().await;

        run(&pool, &folder, now()).await.unwrap();
        let second = run(&pool, &folder, now()).await.unwrap();

        assert_eq!(second.kept, 1);
    }

    #[test]
    fn an_empty_folder_has_never_backed_up_and_owes_one() {
        let folder = tempfile::tempdir().unwrap();

        let status = status(folder.path(), now());

        assert_eq!(status.last_backup_at, None);
        assert_eq!(status.kept, 0);
        assert!(status.due, "nothing yet means one is owed");
        assert!(status.stale, "and never is as stale as it gets");
    }

    #[test]
    fn a_folder_that_is_not_there_reads_as_no_backups_rather_than_a_fault() {
        let status = status(Path::new("Z:\\gone\\missing"), now());

        assert_eq!(status.kept, 0);
        assert!(status.stale);
    }

    #[tokio::test]
    async fn a_backup_made_today_is_not_owed_again() {
        let (_root, pool, folder) = workspace().await;
        run(&pool, &folder, at("2026-08-05T09:00:00Z"))
            .await
            .unwrap();

        let morning = status(&folder, at("2026-08-05T23:59:00Z"));
        assert!(!morning.due, "one a day, not one an hour");
        assert!(!morning.stale);

        let tomorrow = status(&folder, at("2026-08-06T00:01:00Z"));
        assert!(tomorrow.due, "a new day owes a new backup");
        assert!(!tomorrow.stale, "yesterday's backup is not old");
    }

    #[tokio::test]
    async fn a_backup_from_last_week_is_stale() {
        let (_root, pool, folder) = workspace().await;
        run(&pool, &folder, at("2026-07-29T09:00:00Z"))
            .await
            .unwrap();

        let status = status(&folder, now());

        assert_eq!(status.last_backup_at, Some(at("2026-07-29T09:00:00Z")));
        assert!(status.stale);
    }

    #[test]
    fn a_name_round_trips_through_its_stamp() {
        assert_eq!(file_name(now()), "timebuddy-20260805T120000Z.db");
        assert_eq!(made_at("timebuddy-20260805T120000Z.db"), Some(now()));
    }

    #[test]
    fn a_name_this_app_did_not_write_has_no_stamp() {
        for stranger in [
            "notes.txt",
            "timebuddy.db",
            "timebuddy-.db",
            "timebuddy-old.db",
            "timebuddy-20260805T120000Z.db.bak",
            "backup-20260805T120000Z.db",
        ] {
            assert_eq!(made_at(stranger), None, "{stranger} is not ours");
        }
    }

    #[test]
    fn a_blank_folder_setting_resolves_to_one_beside_the_database() {
        let data_dir = Path::new("C:\\Users\\test\\AppData\\Roaming\\TimeBuddy");

        assert_eq!(
            resolve_folder(None, data_dir),
            data_dir.join(DEFAULT_FOLDER),
            "absent means the app's own data directory"
        );
        assert_eq!(
            resolve_folder(Some("   "), data_dir),
            data_dir.join(DEFAULT_FOLDER),
            "and so does a folder someone cleared"
        );
        assert_eq!(
            resolve_folder(Some("D:\\OneDrive\\TimeBuddy"), data_dir),
            PathBuf::from("D:\\OneDrive\\TimeBuddy")
        );
    }
}
