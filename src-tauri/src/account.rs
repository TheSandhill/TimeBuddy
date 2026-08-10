//! The single local account — a door, not a vault (ADR-0003).
//!
//! The database is deliberately **not** encrypted. Anyone with file access can
//! read `timebuddy.db`, and this module does not pretend otherwise. What it
//! buys is that the app does not open straight into someone's billing data on
//! a laptop other people use.
//!
//! Nothing here can be read back out. The password and the recovery phrase are
//! stored as Argon2 hashes and only ever compared against — which is also why
//! a forgotten password costs a recovery phrase rather than years of hours: the
//! password is not a key, so losing it decrypts nothing and destroys nothing.
//!
//! The row's **absence** is what "never set up" means. It is the only thing the
//! first-run wizard keys off, and the reason migration 4 seeds nothing: a row
//! with an empty hash would be an account with no password.

use argon2::password_hash::rand_core::{OsRng, RngCore};
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use chrono::{DateTime, Duration, Utc};
use sqlx::{FromRow, SqlitePool};
use tauri::State;

use crate::db::Db;
use crate::error::{Error, Result, ValidationCode};

/// How long "remember me" lasts (ADR-0003).
pub const REMEMBER_DAYS: i64 = 30;

/// The shortest password accepted. Long enough to not be a shoulder-surf, short
/// enough that it is not the reason someone turns the lock screen off.
const MIN_PASSWORD_LENGTH: usize = 8;

/// The shortest recovery phrase. Longer than a password, because it is the only
/// thing standing between a forgotten password and a lost app — and because it
/// is written down rather than remembered.
const MIN_PHRASE_LENGTH: usize = 12;

#[derive(Debug, FromRow)]
struct Account {
    password_hash: String,
    recovery_phrase_hash: String,
    remembered_token_hash: Option<String>,
    remembered_until: Option<DateTime<Utc>>,
}

const SELECT: &str = "SELECT password_hash, recovery_phrase_hash, remembered_token_hash, \
                      remembered_until FROM account WHERE id = 1";

async fn load(pool: &SqlitePool) -> Result<Option<Account>> {
    Ok(sqlx::query_as(SELECT).fetch_optional(pool).await?)
}

/// Whether this install has been set up. `false` is what raises the wizard.
pub async fn exists(pool: &SqlitePool) -> Result<bool> {
    Ok(load(pool).await?.is_some())
}

// -- Hashing ----------------------------------------------------------------

/// Argon2id with the crate's default parameters, salted per hash.
///
/// The salt travels inside the PHC string, so nothing here has to remember
/// where it put one.
fn hash(secret: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(Error::hashing)
}

/// Whether `secret` is the one that produced `stored`.
///
/// A stored hash that will not parse is treated as "no" rather than as an
/// error: it means the row was tampered with, and the answer to that is a
/// closed door, not a stack trace.
fn matches(secret: &str, stored: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(stored) else {
        return false;
    };
    Argon2::default()
        .verify_password(secret.as_bytes(), &parsed)
        .is_ok()
}

/// Normalises a recovery phrase before it is hashed or compared.
///
/// Case and stray spacing are dropped on both sides, so a phrase written down
/// as "Blue Horse Battery" still opens the door when it is typed back as
/// "blue  horse battery". A password gets none of this — every character of a
/// password is deliberate, including the spaces.
fn normalise_phrase(phrase: &str) -> String {
    phrase.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn check_password_length(password: &str) -> Result<()> {
    if password.chars().count() < MIN_PASSWORD_LENGTH {
        return Err(Error::validation(ValidationCode::PasswordTooShort));
    }
    Ok(())
}

fn check_phrase(phrase: &str) -> Result<String> {
    let normalised = normalise_phrase(phrase);
    if normalised.chars().count() < MIN_PHRASE_LENGTH {
        return Err(Error::validation(ValidationCode::RecoveryPhraseTooShort));
    }
    Ok(normalised)
}

// -- Setting up -------------------------------------------------------------

/// Creates the one account. Refuses if there already is one.
///
/// That refusal matters: without it, "set up" would be an unauthenticated
/// password reset, and the recovery phrase would be guarding a door with no
/// wall around it.
pub async fn create(
    pool: &SqlitePool,
    password: &str,
    recovery_phrase: &str,
    now: DateTime<Utc>,
) -> Result<()> {
    if exists(pool).await? {
        return Err(Error::validation(ValidationCode::AccountAlreadyExists));
    }
    check_password_length(password)?;
    let phrase = check_phrase(recovery_phrase)?;

    sqlx::query(
        "INSERT INTO account (id, password_hash, recovery_phrase_hash, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?)",
    )
    .bind(hash(password)?)
    .bind(hash(&phrase)?)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

// -- Unlocking --------------------------------------------------------------

/// A token the webview keeps, so the next launch inside 30 days opens straight
/// up. Random rather than derived: it must say nothing about the password.
fn new_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Checks the password.
///
/// Returns a "remember me" token when one was asked for, and `None` when it was
/// not — in which case any token already out there is revoked, because an
/// unticked box is an instruction, not an absence of one.
pub async fn unlock(
    pool: &SqlitePool,
    password: &str,
    remember: bool,
    now: DateTime<Utc>,
) -> Result<Option<String>> {
    let account = load(pool)
        .await?
        .ok_or_else(|| Error::not_found("account", 1))?;

    if !matches(password, &account.password_hash) {
        return Err(Error::validation(ValidationCode::WrongPassword));
    }

    if !remember {
        forget(pool, now).await?;
        return Ok(None);
    }

    let token = new_token();
    sqlx::query(
        "UPDATE account SET remembered_token_hash = ?, remembered_until = ?, updated_at = ?
         WHERE id = 1",
    )
    .bind(hash(&token)?)
    .bind(now + Duration::days(REMEMBER_DAYS))
    .bind(now)
    .execute(pool)
    .await?;

    Ok(Some(token))
}

/// Whether a token from a previous launch still opens the door.
///
/// Expiry is checked here rather than trusted from the webview: the deadline
/// lives in the row precisely so that the side holding the token is not the
/// side deciding whether it has passed.
pub async fn resume(pool: &SqlitePool, token: &str, now: DateTime<Utc>) -> Result<bool> {
    let Some(account) = load(pool).await? else {
        return Ok(false);
    };
    let (Some(stored), Some(until)) = (account.remembered_token_hash, account.remembered_until)
    else {
        return Ok(false);
    };

    if now >= until {
        // Spent, so it is cleared rather than left to be re-offered daily.
        forget(pool, now).await?;
        return Ok(false);
    }

    Ok(matches(token, &stored))
}

/// Revokes whatever was being remembered.
///
/// Not public: nothing outside this module has a reason to end a session, and
/// the two that do — an unticked box and a password reset — are both here.
async fn forget(pool: &SqlitePool, now: DateTime<Utc>) -> Result<()> {
    sqlx::query(
        "UPDATE account SET remembered_token_hash = NULL, remembered_until = NULL, updated_at = ?
         WHERE id = 1",
    )
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

// -- Recovering -------------------------------------------------------------

/// Sets a new password against the recovery phrase. Fully offline: no email,
/// no server, no reset link (ADR-0003).
///
/// Everything being remembered is revoked at the same time. A password reset
/// that left an old session open would be a reset in name only.
pub async fn reset_password(
    pool: &SqlitePool,
    recovery_phrase: &str,
    new_password: &str,
    now: DateTime<Utc>,
) -> Result<()> {
    let account = load(pool)
        .await?
        .ok_or_else(|| Error::not_found("account", 1))?;

    if !matches(&normalise_phrase(recovery_phrase), &account.recovery_phrase_hash) {
        return Err(Error::validation(ValidationCode::WrongRecoveryPhrase));
    }
    check_password_length(new_password)?;

    sqlx::query(
        "UPDATE account
         SET password_hash = ?, remembered_token_hash = NULL, remembered_until = NULL,
             updated_at = ?
         WHERE id = 1",
    )
    .bind(hash(new_password)?)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

// -- Command layer ----------------------------------------------------------

#[tauri::command]
pub async fn account_exists(db: State<'_, Db>) -> Result<bool> {
    exists(&db.0).await
}

#[tauri::command]
pub async fn create_account(
    db: State<'_, Db>,
    password: String,
    recovery_phrase: String,
) -> Result<()> {
    create(&db.0, &password, &recovery_phrase, Utc::now()).await
}

#[tauri::command]
pub async fn unlock_account(
    db: State<'_, Db>,
    password: String,
    remember: bool,
) -> Result<Option<String>> {
    unlock(&db.0, &password, remember, Utc::now()).await
}

#[tauri::command]
pub async fn resume_session(db: State<'_, Db>, token: String) -> Result<bool> {
    resume(&db.0, &token, Utc::now()).await
}

#[tauri::command]
pub async fn reset_account_password(
    db: State<'_, Db>,
    recovery_phrase: String,
    password: String,
) -> Result<()> {
    reset_password(&db.0, &recovery_phrase, &password, Utc::now()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::test_support::{at, now};

    const PASSWORD: &str = "correct horse";
    const PHRASE: &str = "Blue Horse Battery Staple";

    async fn set_up(pool: &SqlitePool) {
        create(pool, PASSWORD, PHRASE, now()).await.unwrap();
    }

    #[tokio::test]
    async fn a_fresh_install_has_no_account_to_unlock() {
        let pool = test_pool().await;

        assert!(!exists(&pool).await.unwrap());
    }

    #[tokio::test]
    async fn setting_up_creates_the_one_account() {
        let pool = test_pool().await;

        set_up(&pool).await;

        assert!(exists(&pool).await.unwrap());
    }

    #[tokio::test]
    async fn neither_secret_is_stored_in_a_form_anything_can_read_back() {
        // The whole of ADR-0003's honesty rests on this: the file is readable,
        // so what is in it must not be the password.
        let pool = test_pool().await;
        set_up(&pool).await;

        let account = load(&pool).await.unwrap().unwrap();

        assert!(!account.password_hash.contains(PASSWORD));
        assert!(!account.recovery_phrase_hash.contains("battery"));
        assert!(account.password_hash.starts_with("$argon2"));
        assert!(account.recovery_phrase_hash.starts_with("$argon2"));
    }

    #[tokio::test]
    async fn two_accounts_cannot_be_set_up_over_each_other() {
        // Otherwise setup would be a password reset that needs no phrase.
        let pool = test_pool().await;
        set_up(&pool).await;

        let error = create(&pool, "something else", PHRASE, now())
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::AccountAlreadyExists
            }
        ));
    }

    #[tokio::test]
    async fn a_short_password_is_refused_before_anything_is_written() {
        let pool = test_pool().await;

        let error = create(&pool, "short", PHRASE, now()).await.unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::PasswordTooShort
            }
        ));
        assert!(!exists(&pool).await.unwrap());
    }

    #[tokio::test]
    async fn a_short_recovery_phrase_is_refused() {
        let pool = test_pool().await;

        let error = create(&pool, PASSWORD, "too short", now())
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::RecoveryPhraseTooShort
            }
        ));
        assert!(!exists(&pool).await.unwrap());
    }

    #[tokio::test]
    async fn the_right_password_opens_the_door() {
        let pool = test_pool().await;
        set_up(&pool).await;

        assert_eq!(unlock(&pool, PASSWORD, false, now()).await.unwrap(), None);
    }

    #[tokio::test]
    async fn the_wrong_password_does_not() {
        let pool = test_pool().await;
        set_up(&pool).await;

        let error = unlock(&pool, "not it at all", false, now())
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::WrongPassword
            }
        ));
    }

    #[tokio::test]
    async fn a_password_keeps_every_space_it_was_given() {
        // Trimming a password would quietly accept one that is not the one.
        let pool = test_pool().await;
        set_up(&pool).await;

        assert!(unlock(&pool, " correct horse ", false, now()).await.is_err());
    }

    #[tokio::test]
    async fn remembering_hands_back_a_token_that_is_not_the_password() {
        let pool = test_pool().await;
        set_up(&pool).await;

        let token = unlock(&pool, PASSWORD, true, now())
            .await
            .unwrap()
            .expect("a token when remembering was asked for");

        assert_ne!(token, PASSWORD);
        assert!(token.len() >= 32);
        assert!(resume(&pool, &token, now()).await.unwrap());
    }

    #[tokio::test]
    async fn the_token_is_stored_hashed_like_everything_else() {
        let pool = test_pool().await;
        set_up(&pool).await;

        let token = unlock(&pool, PASSWORD, true, now()).await.unwrap().unwrap();
        let stored = load(&pool).await.unwrap().unwrap().remembered_token_hash;

        assert_ne!(stored.as_deref(), Some(token.as_str()));
    }

    #[tokio::test]
    async fn a_token_nobody_issued_opens_nothing() {
        let pool = test_pool().await;
        set_up(&pool).await;
        unlock(&pool, PASSWORD, true, now()).await.unwrap();

        assert!(!resume(&pool, "made up", now()).await.unwrap());
    }

    #[tokio::test]
    async fn not_remembering_leaves_nothing_to_resume_with() {
        let pool = test_pool().await;
        set_up(&pool).await;
        let token = unlock(&pool, PASSWORD, true, now()).await.unwrap().unwrap();

        // Unticking the box is an instruction, not the absence of one.
        unlock(&pool, PASSWORD, false, now()).await.unwrap();

        assert!(!resume(&pool, &token, now()).await.unwrap());
    }

    #[tokio::test]
    async fn being_remembered_runs_out_after_thirty_days() {
        let pool = test_pool().await;
        set_up(&pool).await;
        let token = unlock(&pool, PASSWORD, true, now()).await.unwrap().unwrap();

        let just_inside = now() + Duration::days(REMEMBER_DAYS) - Duration::seconds(1);
        assert!(resume(&pool, &token, just_inside).await.unwrap());

        let just_outside = now() + Duration::days(REMEMBER_DAYS);
        assert!(!resume(&pool, &token, just_outside).await.unwrap());
    }

    #[tokio::test]
    async fn an_expired_token_is_cleared_rather_than_re_offered() {
        let pool = test_pool().await;
        set_up(&pool).await;
        let token = unlock(&pool, PASSWORD, true, now()).await.unwrap().unwrap();

        resume(&pool, &token, now() + Duration::days(REMEMBER_DAYS))
            .await
            .unwrap();

        let account = load(&pool).await.unwrap().unwrap();
        assert_eq!(account.remembered_token_hash, None);
        assert_eq!(account.remembered_until, None);
    }

    #[tokio::test]
    async fn a_fresh_install_resumes_nothing() {
        let pool = test_pool().await;

        assert!(!resume(&pool, "anything", now()).await.unwrap());
    }

    #[tokio::test]
    async fn locking_by_hand_ends_the_thirty_days() {
        let pool = test_pool().await;
        set_up(&pool).await;
        let token = unlock(&pool, PASSWORD, true, now()).await.unwrap().unwrap();

        forget(&pool, now()).await.unwrap();

        assert!(!resume(&pool, &token, now()).await.unwrap());
    }

    #[tokio::test]
    async fn the_recovery_phrase_sets_a_new_password() {
        // The point of ADR-0003: no single forgotten string destroys the hours.
        let pool = test_pool().await;
        set_up(&pool).await;

        reset_password(&pool, PHRASE, "a whole new one", now())
            .await
            .unwrap();

        assert!(unlock(&pool, "a whole new one", false, now()).await.is_ok());
        assert!(unlock(&pool, PASSWORD, false, now()).await.is_err());
    }

    #[tokio::test]
    async fn the_phrase_forgives_case_and_spacing_but_not_the_words() {
        let pool = test_pool().await;
        set_up(&pool).await;

        reset_password(&pool, "  blue   horse battery STAPLE ", "a whole new one", now())
            .await
            .unwrap();

        assert!(unlock(&pool, "a whole new one", false, now()).await.is_ok());
    }

    #[tokio::test]
    async fn the_wrong_phrase_leaves_the_password_standing() {
        let pool = test_pool().await;
        set_up(&pool).await;

        let error = reset_password(&pool, "green horse battery staple", "a whole new one", now())
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::WrongRecoveryPhrase
            }
        ));
        assert!(unlock(&pool, PASSWORD, false, now()).await.is_ok());
    }

    #[tokio::test]
    async fn a_reset_refuses_a_password_too_short_to_be_one() {
        let pool = test_pool().await;
        set_up(&pool).await;

        let error = reset_password(&pool, PHRASE, "short", now())
            .await
            .unwrap_err();

        assert!(matches!(
            error,
            Error::Validation {
                code: ValidationCode::PasswordTooShort
            }
        ));
        assert!(unlock(&pool, PASSWORD, false, now()).await.is_ok());
    }

    #[tokio::test]
    async fn a_reset_ends_every_session_that_was_being_remembered() {
        // A reset that left yesterday's session open would be one in name only.
        let pool = test_pool().await;
        set_up(&pool).await;
        let token = unlock(&pool, PASSWORD, true, now()).await.unwrap().unwrap();

        reset_password(&pool, PHRASE, "a whole new one", at("2026-08-06T09:00:00Z"))
            .await
            .unwrap();

        assert!(!resume(&pool, &token, now()).await.unwrap());
    }

    #[tokio::test]
    async fn only_one_account_can_ever_be_stored() {
        let pool = test_pool().await;
        set_up(&pool).await;

        let second = sqlx::query(
            "INSERT INTO account (id, password_hash, recovery_phrase_hash, created_at, updated_at)
             VALUES (2, 'x', 'y', '', '')",
        )
        .execute(&pool)
        .await;

        assert!(second.is_err(), "account is a single-row table");
    }
}
