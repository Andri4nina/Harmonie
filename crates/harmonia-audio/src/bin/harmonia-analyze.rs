//! Interprète un fichier de descripteurs et écrit l'analyse en JSON.
//!
//! ```text
//! harmonia-analyze descripteurs.json [analyse.json]
//! ```
//!
//! Sans second argument, l'analyse est écrite sur la sortie standard.

use std::process::ExitCode;
use std::{env, fs};

use harmonia_audio::{Features, Params, analyze};

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let input = args.next().ok_or("usage : harmonia-analyze descripteurs.json [analyse.json]")?;
    let output = args.next();
    let text = fs::read_to_string(&input).map_err(|e| format!("lecture de {input} : {e}"))?;
    let features: Features = serde_json::from_str(&text).map_err(|e| format!("descripteurs invalides : {e}"))?;
    let analysis = analyze(&features, &Params::default())?;
    let json = serde_json::to_string_pretty(&analysis).map_err(|e| e.to_string())?;
    match output {
        Some(path) => fs::write(&path, json).map_err(|e| format!("écriture de {path} : {e}")),
        None => {
            println!("{json}");
            Ok(())
        }
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            ExitCode::FAILURE
        }
    }
}
