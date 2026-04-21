use tauri::{AppHandle, Manager, WebviewWindowBuilder, WebviewUrl};
use std::sync::Mutex;
use std::process::Child;

// Sidecar state — holds the Node.js backend process
struct SidecarState {
    process: Option<Child>,
}

// ── Window Management Commands ──────────────────────────────────────

#[tauri::command]
async fn create_window(
    app: AppHandle,
    label: String,
    title: String,
    width: f64,
    height: f64,
    url: String,
    transparent: Option<bool>,
    always_on_top: Option<bool>,
    decorations: Option<bool>,
    visible: Option<bool>,
    skip_taskbar: Option<bool>,
    min_width: Option<f64>,
    min_height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    focusable: Option<bool>,
) -> Result<(), String> {
    // If window already exists, just show & focus it
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let url = if url.starts_with("http") {
        WebviewUrl::External(url.parse().map_err(|e| format!("{e}"))?)
    } else {
        WebviewUrl::App(url.into())
    };

    let mut builder = WebviewWindowBuilder::new(&app, &label, url)
        .title(&title)
        .inner_size(width, height)
        .visible(visible.unwrap_or(true))
        .transparent(transparent.unwrap_or(false))
        .always_on_top(always_on_top.unwrap_or(false))
        .decorations(decorations.unwrap_or(true))
        .skip_taskbar(skip_taskbar.unwrap_or(false))
        .focused(focusable.unwrap_or(true));

    if let (Some(mw), Some(mh)) = (min_width, min_height) {
        builder = builder.min_inner_size(mw, mh);
    }
    if let (Some(px), Some(py)) = (x, y) {
        builder = builder.position(px, py);
    }

    let window = builder.build().map_err(|e| format!("Failed to create window: {e}"))?;

    // Special handling for overlay/tracker: set ignore cursor events
    if label == "overlay" || label == "tracker" {
        let _ = window.set_ignore_cursor_events(true);
    }

    Ok(())
}

#[tauri::command]
async fn close_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn minimize_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.minimize().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn hide_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.hide().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn show_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

#[tauri::command]
async fn set_ignore_mouse(app: AppHandle, label: String, ignore: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.set_ignore_cursor_events(ignore).map_err(|e| format!("{e}"))?;
    }
    Ok(())
}

// ── Sidecar Management ─────────────────────────────────────────────

#[tauri::command]
async fn start_sidecar(app: AppHandle) -> Result<String, String> {
    let state = app.state::<Mutex<SidecarState>>();
    let mut state = state.lock().map_err(|e| format!("{e}"))?;

    if state.process.is_some() {
        return Ok("already_running".to_string());
    }

    // Resolve the sidecar script path — different in dev vs production
    let sidecar_script = if cfg!(debug_assertions) {
        // Dev mode: relative to src-tauri directory
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("..").join("sidecar").join("backend.js")
    } else {
        // Production: use Tauri resource directory
        let resource_dir = app.path().resource_dir().map_err(|e| format!("{e}"))?;
        resource_dir.join("sidecar").join("backend.js")
    };

    let sidecar_script = std::fs::canonicalize(&sidecar_script)
        .unwrap_or_else(|_| sidecar_script.clone());

    // Strip Windows UNC prefix (\\?\) — Node.js can't handle it
    let sidecar_path_str = sidecar_script.to_string_lossy().to_string();
    let sidecar_path_str = sidecar_path_str.strip_prefix(r"\\?\").unwrap_or(&sidecar_path_str).to_string();
    let sidecar_script = std::path::PathBuf::from(&sidecar_path_str);

    println!("[tauri] Sidecar script path: {}", sidecar_script.display());

    if !sidecar_script.exists() {
        return Err(format!("Sidecar script not found: {}", sidecar_script.display()));
    }

    // Spawn Node.js with the backend script
    // Set NODE_PATH so main.cjs (loaded via sidecar) can find modules in sidecar/node_modules
    // Redirect stdout/stderr to log files in userData so we can debug production issues
    let sidecar_dir = sidecar_script.parent().unwrap();
    let sidecar_node_modules = sidecar_dir.join("node_modules").to_string_lossy().to_string();
    let resource_dir_str = sidecar_dir.parent().unwrap().to_string_lossy().to_string();

    // Log file location: %APPDATA%/DraftCoach/sidecar.log
    let log_dir = app.path().app_data_dir().map_err(|e| format!("{e}"))?;
    std::fs::create_dir_all(&log_dir).ok();
    let log_path = log_dir.join("sidecar.log");
    println!("[tauri] Sidecar log: {}", log_path.display());

    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to create log file: {e}"))?;
    let log_file_err = log_file.try_clone().map_err(|e| format!("{e}"))?;

    let mut cmd = std::process::Command::new("node");
    cmd.arg(&sidecar_script)
        .env("DRAFTCOACH_RESOURCE_DIR", &resource_dir_str)
        .env("NODE_PATH", &sidecar_node_modules)
        .stdout(std::process::Stdio::from(log_file))
        .stderr(std::process::Stdio::from(log_file_err));

    // Windows: hide the spawned node console window
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start sidecar (is Node.js installed and in PATH?): {e}"))?;

    println!("[tauri] Sidecar started (PID: {})", child.id());
    state.process = Some(child);

    Ok("started".to_string())
}

#[tauri::command]
async fn stop_sidecar(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Mutex<SidecarState>>();
    let mut state = state.lock().map_err(|e| format!("{e}"))?;

    if let Some(ref mut child) = state.process {
        let _ = child.kill();
        let _ = child.wait();
        println!("[tauri] Sidecar stopped");
    }
    state.process = None;
    Ok(())
}

// ── App Entry Point ─────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(Mutex::new(SidecarState { process: None }))
        .invoke_handler(tauri::generate_handler![
            create_window,
            close_window,
            minimize_window,
            hide_window,
            show_window,
            set_ignore_mouse,
            start_sidecar,
            stop_sidecar,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                match start_sidecar(handle.clone()).await {
                    Ok(status) => println!("[tauri] Sidecar auto-start: {status}"),
                    Err(e) => eprintln!("[tauri] Sidecar auto-start failed: {e}"),
                }

                // Wait for backend port to be open (max 15s)
                let port_ready = tokio::time::timeout(std::time::Duration::from_secs(15), async {
                    for _ in 0..30 {
                        if let Ok(mut stream) = tokio::net::TcpStream::connect("127.0.0.1:3210").await {
                            use tokio::io::AsyncWriteExt;
                            let _ = stream.shutdown().await;
                            println!("[tauri] Backend port 3210 is open");
                            return true;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                    false
                }).await;

                if port_ready.unwrap_or(false) {
                    println!("[tauri] Backend ready, showing window");
                } else {
                    eprintln!("[tauri] Backend not ready after 15s, showing window anyway");
                }

                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    println!("[tauri] Main window shown");
                } else {
                    eprintln!("[tauri] Failed to get main window handle");
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill sidecar when main window is destroyed
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    let handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = stop_sidecar(handle).await;
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running DraftCoach");
}
