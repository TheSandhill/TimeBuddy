//! Normalising user-typed text before it reaches the database.
//!
//! Every string a person types arrives with stray whitespace. Deciding once
//! that trimmed-empty means absent keeps `""` out of the tables entirely, so no
//! query has to ask whether a name is empty *or* null.

use crate::error::{Error, Result, ValidationCode};

/// Trims required text, rejecting it when nothing is left.
pub fn required(value: &str, code: ValidationCode) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(Error::validation(code));
    }
    Ok(trimmed.to_string())
}

/// Trims optional text, collapsing blank to absent.
pub fn optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn required_trims_and_rejects_blank() {
        assert_eq!(
            required("  Acme  ", ValidationCode::NameRequired).unwrap(),
            "Acme"
        );
        assert!(required(" \t\n ", ValidationCode::NameRequired).is_err());
    }

    #[test]
    fn optional_collapses_blank_to_absent() {
        assert_eq!(optional(Some("  note ")), Some("note".to_string()));
        assert_eq!(optional(Some("   ")), None);
        assert_eq!(optional(None), None);
    }
}
