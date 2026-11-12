//! Harmonie pour ordinateur.
//!
//! Une fenêtre qui affiche le site construit (`apps/web/dist`), servi depuis
//! l'application : le moteur de théorie (WebAssembly), l'explorateur, les
//! cours, l'entraînement et le générateur fonctionnent sans connexion. Aucune
//! logique musicale ici. Deux greffons natifs : la boîte « Enregistrer sous »
//! et l'écriture du fichier choisi (exports MIDI et MusicXML).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("échec du lancement d'Harmonie");
}
