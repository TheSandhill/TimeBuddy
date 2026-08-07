//! Fixtures shared by the unit tests.
//!
//! Time is injected into every core function rather than read from the clock,
//! so "not in the future" is a rule the tests can pin down instead of race.

use chrono::{DateTime, NaiveDate, Utc};

/// Parses an RFC 3339 instant, panicking on a malformed literal.
pub fn at(text: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(text)
        .expect("test literal is a valid RFC 3339 instant")
        .with_timezone(&Utc)
}

/// Parses a `YYYY-MM-DD` date, panicking on a malformed literal.
pub fn day(text: &str) -> NaiveDate {
    text.parse().expect("test literal is a valid ISO date")
}

/// The instant the tests pretend it is: a Wednesday, midday, mid-month.
pub fn now() -> DateTime<Utc> {
    at("2026-08-05T12:00:00Z")
}

/// The date component of [`now`].
pub fn today() -> NaiveDate {
    now().date_naive()
}
