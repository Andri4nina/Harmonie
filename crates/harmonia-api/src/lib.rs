//! API HTTP d'Harmonie.
//!
//! - `/health` : état du service et de la base ;
//! - `/v1/…` : routes des utilisateurs (jeton Supabase Auth) ;
//! - `/internal/…` : routes des workers d'analyse (`WORKER_TOKEN`).
//!
//! La base est PostgreSQL (Supabase en production, Docker en local) ; les
//! fichiers audio vont dans un stockage compatible S3 ou un dossier local.

pub mod auth;
pub mod config;
pub mod ear;
pub mod error;
pub mod events;
pub mod jobs;
pub mod routes;
pub mod storage;
pub mod sync;

use std::sync::Arc;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderValue, Method, header};
use axum::routing::{get, post};
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::auth::Verifier;
use crate::config::Config;
use crate::storage::Storage;

/// Migrations du schéma, embarquées dans l'exécutable.
pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("../../db/migrations");

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub storage: Arc<Storage>,
    pub verifier: Arc<Verifier>,
    pub config: Arc<Config>,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> Result<AppState, String> {
        Ok(AppState {
            pool,
            storage: Arc::new(Storage::new(&config.storage)?),
            verifier: Arc::new(Verifier::new(config.supabase_url.as_deref(), config.jwt_secret.as_deref())),
            config: Arc::new(config),
        })
    }
}

/// Taille maximale des descripteurs envoyés par un worker.
const FEATURES_LIMIT: usize = 32 * 1024 * 1024;

pub fn router(state: AppState) -> Router {
    let origins: Vec<HeaderValue> = state.config.cors_origins.iter().filter_map(|origin| origin.parse().ok()).collect();
    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);
    let upload_limit = state.config.max_upload_bytes + 64 * 1024;

    let user = Router::new()
        .route("/me", get(routes::me))
        .route("/tracks", get(routes::list_tracks).post(routes::upload_track).layer(DefaultBodyLimit::max(upload_limit)))
        .route("/tracks/{id}", get(routes::get_track))
        .route("/tracks/{id}/audio", get(routes::track_audio))
        .route("/tracks/{id}/analysis", get(routes::track_analysis))
        .route("/tracks/{id}/corrections", post(routes::add_correction))
        .route("/ear/cards", get(ear::list).put(ear::save))
        .route("/sync", get(sync::list))
        .route("/sync/{key}", axum::routing::put(sync::save));

    let internal = Router::new()
        .route("/jobs/claim", post(jobs::claim))
        .route("/jobs/{id}/audio", get(jobs::audio))
        .route("/jobs/{id}/heartbeat", post(jobs::heartbeat))
        .route("/jobs/{id}/complete", post(jobs::complete).layer(DefaultBodyLimit::max(FEATURES_LIMIT)))
        .route("/jobs/{id}/fail", post(jobs::fail));

    Router::new()
        .route("/health", get(routes::health))
        .nest("/v1", user.layer(cors))
        .nest("/internal", internal)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::StorageConfig;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    /// État sans base joignable : suffit pour tout ce qui précède la base.
    fn state() -> AppState {
        let config = Config {
            database_url: "postgres://127.0.0.1:1/absente".into(),
            port: 0,
            cors_origins: vec!["http://localhost:5173".into()],
            worker_token: "w".repeat(32),
            supabase_url: None,
            jwt_secret: Some(auth::tests::SECRET.into()),
            storage: StorageConfig::Local { dir: std::env::temp_dir() },
            max_upload_bytes: 1024,
        };
        let pool = sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(300))
            .connect_lazy(&config.database_url)
            .unwrap();
        AppState::new(pool, config).unwrap()
    }

    async fn call(request: Request<Body>) -> (StatusCode, String) {
        let response = router(state()).oneshot(request).await.unwrap();
        let status = response.status();
        let body = response.into_body().collect().await.unwrap().to_bytes();
        (status, String::from_utf8_lossy(&body).into_owned())
    }

    #[tokio::test]
    async fn user_routes_require_a_token() {
        let (status, body) = call(Request::get("/v1/tracks").body(Body::empty()).unwrap()).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(body.contains("\"error\":\"unauthorized\""));
        let forged = Request::get("/v1/tracks").header("authorization", "Bearer abc.def.ghi").body(Body::empty()).unwrap();
        assert_eq!(call(forged).await.0, StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn internal_routes_require_the_worker_token() {
        let request = |token: &str| {
            Request::post("/internal/jobs/claim")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(r#"{"worker_id":"w1"}"#))
                .unwrap()
        };
        assert_eq!(call(request(&"x".repeat(32))).await.0, StatusCode::FORBIDDEN);
        // Le bon jeton passe la garde ; la base absente donne alors une erreur interne.
        assert_eq!(call(request(&"w".repeat(32))).await.0, StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn health_reports_an_unreachable_database() {
        let (status, body) = call(Request::get("/health").body(Body::empty()).unwrap()).await;
        assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
        assert!(body.contains("\"database\":false"));
    }

    #[tokio::test]
    async fn cors_allows_only_the_configured_site() {
        let preflight = |origin: &str| {
            Request::builder()
                .method("OPTIONS")
                .uri("/v1/tracks")
                .header("origin", origin)
                .header("access-control-request-method", "GET")
                .body(Body::empty())
                .unwrap()
        };
        let allowed = router(state()).oneshot(preflight("http://localhost:5173")).await.unwrap();
        assert_eq!(allowed.headers()["access-control-allow-origin"], "http://localhost:5173");
        let refused = router(state()).oneshot(preflight("https://ailleurs.example")).await.unwrap();
        assert!(refused.headers().get("access-control-allow-origin").is_none());
    }
}
