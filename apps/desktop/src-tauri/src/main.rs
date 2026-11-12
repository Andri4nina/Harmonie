// Pas de console en plus de la fenêtre, sous Windows, dans la version publiée.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    harmonie_desktop_lib::run()
}
