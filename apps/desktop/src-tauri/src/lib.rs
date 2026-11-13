//! Harmonie pour ordinateur.
//!
//! Une fenêtre qui affiche le site construit (`apps/web/dist`), servi depuis
//! l'application : le moteur de théorie (WebAssembly), l'explorateur, les
//! cours, l'entraînement et le générateur fonctionnent sans connexion. Aucune
//! logique musicale ici. Deux greffons natifs : la boîte « Enregistrer sous »
//! et l'écriture du fichier choisi (exports MIDI et MusicXML) ; sur
//! ordinateur, la mise à jour automatique et le redémarrage.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_fs::init());
    // Sur ordinateur, l'application se met à jour depuis les publications du
    // dépôt (fichier latest.json signé), puis redémarre.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build()).plugin(tauri_plugin_process::init());
    builder
        .run(tauri::generate_context!())
        .expect("échec du lancement d'Harmonie");
}
