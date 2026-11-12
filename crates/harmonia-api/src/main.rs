//! Serveur de l'API : applique les migrations puis écoute sur `PORT`.

use std::time::Duration;

use harmonia_api::config::Config;
use harmonia_api::{AppState, MIGRATOR, router};
use sqlx::postgres::PgPoolOptions;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), String> {
    tracing_subscriber::fmt().with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"))).init();
    let config = Config::from_env()?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&config.database_url)
        .await
        .map_err(|e| format!("connexion à PostgreSQL impossible : {e}"))?;
    MIGRATOR.run(&pool).await.map_err(|e| format!("migrations : {e}"))?;

    let address = std::net::SocketAddr::from(([0, 0, 0, 0], config.port));
    let state = AppState::new(pool, config)?;
    let listener = tokio::net::TcpListener::bind(address).await.map_err(|e| format!("écoute sur {address} : {e}"))?;
    tracing::info!(%address, "API Harmonie prête");
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .map_err(|e| e.to_string())
}
