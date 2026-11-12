//! Stockage des fichiers audio. La base ne contient jamais d'audio, seulement
//! la clé de l'objet.
//!
//! - `local` : un dossier du serveur (développement, tests) ;
//! - `s3` : tout service compatible S3 — Supabase Storage, RustFS, MinIO… Les
//!   requêtes sont signées (SigV4) par `rusty-s3` et envoyées par `reqwest`.

use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use bytes::Bytes;
use rusty_s3::{Bucket, Credentials, S3Action, UrlStyle};

use crate::config::StorageConfig;

pub enum Storage {
    Local { dir: PathBuf },
    S3 { bucket: Bucket, credentials: Credentials, http: reqwest::Client },
}

const SIGNATURE_VALIDITY: Duration = Duration::from_secs(300);

impl Storage {
    pub fn new(config: &StorageConfig) -> Result<Storage, String> {
        Ok(match config {
            StorageConfig::Local { dir } => Storage::Local { dir: dir.clone() },
            StorageConfig::S3 { endpoint, bucket, region, access_key, secret_key } => {
                let url = endpoint.parse().map_err(|error| format!("S3_ENDPOINT invalide : {error}"))?;
                Storage::S3 {
                    bucket: Bucket::new(url, UrlStyle::Path, bucket.clone(), region.clone()).map_err(|error| error.to_string())?,
                    credentials: Credentials::new(access_key.clone(), secret_key.clone()),
                    http: reqwest::Client::builder().timeout(Duration::from_secs(120)).build().map_err(|e| e.to_string())?,
                }
            }
        })
    }

    pub fn bucket_name(&self) -> &str {
        match self {
            Storage::Local { .. } => "local",
            Storage::S3 { bucket, .. } => bucket.name(),
        }
    }

    /// Chemin local d'une clé, sans possibilité de sortir du dossier.
    fn local_path(dir: &Path, key: &str) -> Result<PathBuf, String> {
        let relative = Path::new(key);
        if relative.components().any(|c| !matches!(c, Component::Normal(_))) {
            return Err(format!("clé de stockage invalide : {key}"));
        }
        Ok(dir.join(relative))
    }

    pub async fn put(&self, key: &str, data: Bytes, content_type: &str) -> Result<(), String> {
        match self {
            Storage::Local { dir } => {
                let path = Self::local_path(dir, key)?;
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
                }
                tokio::fs::write(path, data).await.map_err(|e| e.to_string())
            }
            Storage::S3 { bucket, credentials, http } => {
                let url = bucket.put_object(Some(credentials), key).sign(SIGNATURE_VALIDITY);
                let response = http
                    .put(url.as_str())
                    .header(reqwest::header::CONTENT_TYPE, content_type)
                    .body(data)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                if response.status().is_success() {
                    Ok(())
                } else {
                    Err(format!("stockage S3 : {} {}", response.status(), response.text().await.unwrap_or_default()))
                }
            }
        }
    }

    pub async fn get(&self, key: &str) -> Result<Bytes, String> {
        match self {
            Storage::Local { dir } => tokio::fs::read(Self::local_path(dir, key)?).await.map(Bytes::from).map_err(|e| e.to_string()),
            Storage::S3 { bucket, credentials, http } => {
                let url = bucket.get_object(Some(credentials), key).sign(SIGNATURE_VALIDITY);
                let response = http.get(url.as_str()).send().await.map_err(|e| e.to_string())?;
                if !response.status().is_success() {
                    return Err(format!("stockage S3 : {}", response.status()));
                }
                response.bytes().await.map_err(|e| e.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_cannot_escape_the_local_directory() {
        let dir = Path::new("/srv/storage");
        assert!(Storage::local_path(dir, "tracks/abc/original.wav").is_ok());
        assert!(Storage::local_path(dir, "../etc/passwd").is_err());
        assert!(Storage::local_path(dir, "/etc/passwd").is_err());
    }

    #[tokio::test]
    async fn local_storage_round_trip() {
        let dir = std::env::temp_dir().join(format!("harmonie-storage-{}", uuid::Uuid::new_v4()));
        let storage = Storage::new(&StorageConfig::Local { dir: dir.clone() }).unwrap();
        storage.put("tracks/x/original.wav", Bytes::from_static(b"RIFF"), "audio/wav").await.unwrap();
        assert_eq!(storage.get("tracks/x/original.wav").await.unwrap(), Bytes::from_static(b"RIFF"));
        assert!(storage.get("tracks/y/original.wav").await.is_err());
        let _ = std::fs::remove_dir_all(dir);
    }
}
