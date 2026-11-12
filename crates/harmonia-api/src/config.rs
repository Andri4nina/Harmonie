//! Configuration, lue une fois au démarrage depuis l'environnement.
//!
//! | Variable | Rôle | Défaut |
//! |---|---|---|
//! | `DATABASE_URL` | PostgreSQL (Supabase, Docker, local) | requise |
//! | `PORT` | port d'écoute | `8080` |
//! | `CORS_ORIGINS` | origines du site web, séparées par des virgules | `http://localhost:5173` |
//! | `WORKER_TOKEN` | secret partagé avec les workers (≥ 32 caractères) | requise |
//! | `SUPABASE_URL` | projet Supabase : ses clés publiques vérifient les jetons | — |
//! | `SUPABASE_JWT_SECRET` | ancien secret HS256 de Supabase, ou secret de test | — |
//! | `STORAGE_BACKEND` | `s3` ou `local` | `local` |
//! | `LOCAL_STORAGE_DIR` | dossier des fichiers en mode `local` | `./storage` |
//! | `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | stockage S3 (Supabase Storage, RustFS) | — |
//! | `MAX_UPLOAD_MB` | taille maximale d'un fichier audio | `50` |
//!
//! Au moins une des deux sources d'authentification (`SUPABASE_URL`,
//! `SUPABASE_JWT_SECRET`) est exigée.

use std::path::PathBuf;

#[derive(Clone, Debug)]
pub enum StorageConfig {
    Local { dir: PathBuf },
    S3 { endpoint: String, bucket: String, region: String, access_key: String, secret_key: String },
}

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub port: u16,
    pub cors_origins: Vec<String>,
    pub worker_token: String,
    pub supabase_url: Option<String>,
    pub jwt_secret: Option<String>,
    pub storage: StorageConfig,
    pub max_upload_bytes: usize,
}

impl Config {
    pub fn from_env() -> Result<Config, String> {
        Config::from_lookup(|name| std::env::var(name).ok().filter(|value| !value.trim().is_empty()))
    }

    /// Construit la configuration à partir d'une fonction de lecture (testable).
    pub fn from_lookup(get: impl Fn(&str) -> Option<String>) -> Result<Config, String> {
        let required = |name: &str| get(name).ok_or_else(|| format!("variable d'environnement {name} manquante"));
        let worker_token = required("WORKER_TOKEN")?;
        if worker_token.len() < 32 {
            return Err("WORKER_TOKEN doit compter au moins 32 caractères".into());
        }
        let supabase_url = get("SUPABASE_URL").map(|url| url.trim_end_matches('/').to_string());
        let jwt_secret = get("SUPABASE_JWT_SECRET");
        if supabase_url.is_none() && jwt_secret.is_none() {
            return Err("définir SUPABASE_URL ou SUPABASE_JWT_SECRET pour vérifier les utilisateurs".into());
        }
        let storage = match get("STORAGE_BACKEND").as_deref().unwrap_or("local") {
            "local" => StorageConfig::Local { dir: PathBuf::from(get("LOCAL_STORAGE_DIR").unwrap_or_else(|| "./storage".into())) },
            "s3" => StorageConfig::S3 {
                endpoint: required("S3_ENDPOINT")?,
                bucket: required("S3_BUCKET")?,
                region: get("S3_REGION").unwrap_or_else(|| "us-east-1".into()),
                access_key: required("S3_ACCESS_KEY_ID")?,
                secret_key: required("S3_SECRET_ACCESS_KEY")?,
            },
            other => return Err(format!("STORAGE_BACKEND inconnu : « {other} » (attendu : s3 ou local)")),
        };
        let number = |name: &str, default: u64| -> Result<u64, String> {
            get(name).map_or(Ok(default), |value| value.parse().map_err(|_| format!("{name} doit être un entier")))
        };
        Ok(Config {
            database_url: required("DATABASE_URL")?,
            port: u16::try_from(number("PORT", 8080)?).map_err(|_| "PORT hors limites".to_string())?,
            cors_origins: get("CORS_ORIGINS")
                .unwrap_or_else(|| "http://localhost:5173".into())
                .split(',')
                .map(|origin| origin.trim().trim_end_matches('/').to_string())
                .filter(|origin| !origin.is_empty())
                .collect(),
            worker_token,
            supabase_url,
            jwt_secret,
            storage,
            max_upload_bytes: usize::try_from(number("MAX_UPLOAD_MB", 50)?.saturating_mul(1024 * 1024)).unwrap_or(usize::MAX),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(pairs: &[(&str, &str)]) -> Result<Config, String> {
        let map: HashMap<String, String> = pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        Config::from_lookup(|name| map.get(name).cloned())
    }

    const BASE: [(&str, &str); 3] = [
        ("DATABASE_URL", "postgres://localhost/harmonie"),
        ("WORKER_TOKEN", "0123456789abcdef0123456789abcdef"),
        ("SUPABASE_JWT_SECRET", "secret"),
    ];

    #[test]
    fn applies_defaults() {
        let config = config(&BASE).unwrap();
        assert_eq!(config.port, 8080);
        assert_eq!(config.cors_origins, ["http://localhost:5173"]);
        assert!(matches!(config.storage, StorageConfig::Local { .. }));
        assert_eq!(config.max_upload_bytes, 50 * 1024 * 1024);
    }

    #[test]
    fn reads_s3_and_origins() {
        let mut pairs = BASE.to_vec();
        pairs.extend([
            ("STORAGE_BACKEND", "s3"),
            ("S3_ENDPOINT", "https://abc.storage.supabase.co/storage/v1/s3"),
            ("S3_BUCKET", "audio"),
            ("S3_ACCESS_KEY_ID", "key"),
            ("S3_SECRET_ACCESS_KEY", "secret"),
            ("CORS_ORIGINS", "https://harmonie.vercel.app/, http://localhost:5173"),
        ]);
        let config = config(&pairs).unwrap();
        assert_eq!(config.cors_origins, ["https://harmonie.vercel.app", "http://localhost:5173"]);
        assert!(matches!(config.storage, StorageConfig::S3 { ref bucket, .. } if bucket == "audio"));
    }

    #[test]
    fn rejects_missing_or_weak_secrets() {
        assert!(config(&BASE[..2]).unwrap_err().contains("SUPABASE"));
        assert!(config(&[BASE[0], ("WORKER_TOKEN", "court"), BASE[2]]).unwrap_err().contains("32"));
        assert!(config(&[BASE[1], BASE[2]]).unwrap_err().contains("DATABASE_URL"));
        let mut pairs = BASE.to_vec();
        pairs.push(("STORAGE_BACKEND", "s3"));
        assert!(config(&pairs).unwrap_err().contains("S3_ENDPOINT"));
    }
}
