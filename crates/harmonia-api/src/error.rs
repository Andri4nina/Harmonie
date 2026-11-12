//! Erreurs de l'API, rendues en JSON : `{ "error": "code", "message": "…" }`.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("authentification requise")]
    Unauthorized,
    #[error("accès refusé")]
    Forbidden,
    #[error("{0} introuvable")]
    NotFound(&'static str),
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Conflict(String),
    #[error("fichier trop volumineux")]
    TooLarge,
    #[error("service indisponible : {0}")]
    Unavailable(String),
    #[error("erreur interne")]
    Internal(String),
}

impl ApiError {
    fn status(&self) -> (StatusCode, &'static str) {
        match self {
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            ApiError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            ApiError::NotFound(_) => (StatusCode::NOT_FOUND, "not_found"),
            ApiError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            ApiError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            ApiError::TooLarge => (StatusCode::PAYLOAD_TOO_LARGE, "too_large"),
            ApiError::Unavailable(_) => (StatusCode::SERVICE_UNAVAILABLE, "unavailable"),
            ApiError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, code) = self.status();
        // Le détail d'une erreur interne reste dans les journaux.
        if let ApiError::Internal(detail) = &self {
            tracing::error!(%detail, "erreur interne");
        }
        (status, Json(json!({ "error": code, "message": self.to_string() }))).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        match error {
            sqlx::Error::RowNotFound => ApiError::NotFound("élément"),
            other => ApiError::Internal(other.to_string()),
        }
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
