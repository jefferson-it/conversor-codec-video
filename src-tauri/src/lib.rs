#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![file_size])
        .run(tauri::generate_context!())
        .expect("error while running Conversor de Vídeo TV 1080p");
}

#[tauri::command]
fn file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .map(|meta| meta.len())
        .map_err(|error| error.to_string())
}
