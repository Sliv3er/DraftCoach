use tauri::{AppHandle, Emitter, Manager, WebviewWindowBuilder, WebviewUrl};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::process::Child;

// Sidecar state — holds the Node.js backend process
struct SidecarState {
    process: Option<Child>,
}

// Global flag to track if app should minimize to tray instead of closing
static MINIMIZE_TO_TRAY: AtomicBool = AtomicBool::new(false);

// ── System Tray Setup ─────────────────────────────────────────────────

fn setup_system_tray(app: &AppHandle) -> Result<TrayIcon, Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show DraftCoach", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
    
    let tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("DraftCoach - AI Companion")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    MINIMIZE_TO_TRAY.store(false, Ordering::SeqCst);
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;
    
    Ok(tray)
}

// ── Sidecar Watchdog ─────────────────────────────────────────────────

async fn start_sidecar_watchdog(app: AppHandle) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        
        let state = match app.try_state::<Mutex<SidecarState>>() {
            Some(s) => s,
            None => continue,
        };
        
        let is_alive = {
            let mut state = match state.lock() {
                Ok(s) => s,
                Err(_) => continue,
            };
            if let Some(ref mut child) = state.process {
                child.try_wait().map(|exit| exit.is_none()).unwrap_or(false)
            } else {
                false
            }
        };
        
        if !is_alive {
            eprintln!("[tauri] Sidecar process died, restarting...");
            
            // Try to restart the sidecar
            match start_sidecar(app.clone()).await {
                Ok(status) => println!("[tauri] Sidecar restarted: {status}"),
                Err(e) => eprintln!("[tauri] Sidecar restart failed: {e}"),
            }
        }
    }
}

// Global flag to stop the overlay cursor watch loop
static OVERLAY_CURSOR_WATCH_ACTIVE: AtomicBool = AtomicBool::new(false);

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

/// Create the in-game overlay window — fullscreen, transparent, always-on-top,
/// click-through, using hash routing to load the Overlay component.
#[tauri::command]
async fn create_overlay_window(app: AppHandle) -> Result<(), String> {
    // If overlay already exists, just return OK
    if app.get_webview_window("overlay").is_some() {
        return Ok(());
    }

    // Use pathname-based URL so main.tsx Router renders the Overlay component
    let url = WebviewUrl::App("/overlay".into());

    let window = WebviewWindowBuilder::new(&app, "overlay", url)
        .title("DraftCoach Overlay")
        .inner_size(1920.0, 1080.0)
        .position(0.0, 0.0)
        .transparent(true)
        .always_on_top(true)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .build()
        .map_err(|e| format!("Failed to create overlay window: {e}"))?;

    // Start as click-through — the cursor watch will toggle this dynamically
    let _ = window.set_ignore_cursor_events(true);
    let _ = window.set_always_on_top(true);

    // Auto-start cursor watch for this overlay
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        start_overlay_cursor_watch_inner(handle).await;
    });

    println!("[tauri] Overlay window created (hidden, cursor watch started)");
    Ok(())
}

// ── Overlay Cursor Watch ───────────────────────────────────────────
// Polls cursor position and toggles click-through based on whether
// the cursor is in an interactive zone of the overlay.

/// Get cursor position using Windows API
#[cfg(target_os = "windows")]
fn get_cursor_pos() -> Option<(i32, i32)> {
    use std::mem::MaybeUninit;
    #[repr(C)]
    struct POINT { x: i32, y: i32 }
    extern "system" { fn GetCursorPos(lp: *mut POINT) -> i32; }
    unsafe {
        let mut pt = MaybeUninit::<POINT>::uninit();
        if GetCursorPos(pt.as_mut_ptr()) != 0 {
            let pt = pt.assume_init();
            Some((pt.x, pt.y))
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_cursor_pos() -> Option<(i32, i32)> {
    None
}

/// Check if cursor is in an interactive overlay zone (percentage-based for DPI awareness)
fn is_in_interactive_zone(x: i32, y: i32, screen_w: i32, screen_h: i32) -> bool {
    // Convert to percentages for DPI-aware zones
    let x_pct = (x as f64 / screen_w as f64) * 100.0;
    let y_pct = (y as f64 / screen_h as f64) * 100.0;
    
    // Zone 1: Top-left item tracker (~18% width, ~46% height)
    if x_pct < 18.0 && y_pct < 46.0 {
        return true;
    }
    // Zone 2: Right edge — enemy spell tracker panel (~13% width, centered vertically, ~19% height)
    if x_pct > 87.0 && y_pct > 40.0 && y_pct < 60.0 {
        return true;
    }
    // Zone 3: Top-right cooldown timer strip (~16% width, ~11% height)
    if y_pct < 11.0 && x_pct > 84.0 {
        return true;
    }
    false
}

async fn start_overlay_cursor_watch_inner(app: AppHandle) {
    OVERLAY_CURSOR_WATCH_ACTIVE.store(true, Ordering::SeqCst);
    let mut was_interactive = false;

    // Get screen dimensions from the overlay window
    let (screen_w, screen_h) = if let Some(win) = app.get_webview_window("overlay") {
        if let Ok(monitor) = win.current_monitor() {
            if let Some(m) = monitor {
                let size = m.size();
                (size.width as i32, size.height as i32)
            } else {
                (1920, 1080)
            }
        } else {
            (1920, 1080)
        }
    } else {
        (1920, 1080)
    };

    while OVERLAY_CURSOR_WATCH_ACTIVE.load(Ordering::SeqCst) {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let overlay = match app.get_webview_window("overlay") {
            Some(w) => w,
            None => continue,
        };

        // Only check when overlay is visible
        if !overlay.is_visible().unwrap_or(false) {
            if was_interactive {
                let _ = overlay.set_ignore_cursor_events(true);
                was_interactive = false;
            }
            continue;
        }

        if let Some((cx, cy)) = get_cursor_pos() {
            let in_zone = is_in_interactive_zone(cx, cy, screen_w, screen_h);
            if in_zone && !was_interactive {
                let _ = overlay.set_ignore_cursor_events(false);
                was_interactive = true;
            } else if !in_zone && was_interactive {
                let _ = overlay.set_ignore_cursor_events(true);
                was_interactive = false;
            }
        }
    }

    // Cleanup: ensure click-through is restored
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.set_ignore_cursor_events(true);
    }
}

#[tauri::command]
async fn stop_overlay_cursor_watch() {
    OVERLAY_CURSOR_WATCH_ACTIVE.store(false, Ordering::SeqCst);
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

    // Kill any stale sidecar process holding our ports (3210, 3211) from a previous run.
    // This is the common failure: app was force-closed, node.exe kept running.
    #[cfg(windows)]
    {
        for port in &["3210", "3211"] {
            let cmd_str = format!(
                "Get-NetTCPConnection -LocalPort {} -State Listen -ErrorAction SilentlyContinue | \
                 ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}",
                port
            );
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = std::process::Command::new("powershell")
                .args(&["-NoProfile", "-Command", &cmd_str])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
        // Give Windows a moment to free the sockets
        std::thread::sleep(std::time::Duration::from_millis(300));
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

    // Determine the install directory (where the .exe lives)
    // In production this is e.g. C:\Users\<user>\AppData\Local\DraftCoach\
    let install_dir = if cfg!(debug_assertions) {
        resource_dir_str.clone()
    } else {
        // In production, the exe is at <install_dir>/draftcoach.exe
        // resource_dir is already the install dir on Windows NSIS
        resource_dir_str.clone()
    };

    let mut cmd = std::process::Command::new("node");
    cmd.arg(&sidecar_script)
        .env("DRAFTCOACH_RESOURCE_DIR", &resource_dir_str)
        .env("DRAFTCOACH_INSTALL_DIR", &install_dir)
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

/// Proxy IPC calls through Rust's HTTP client, bypassing browser connection limits.
/// The browser's 6-connection-per-domain limit blocks fetch() POST requests when
/// SSE EventSource connections occupy all slots. This command lets the frontend
/// call invoke('ipc_proxy', {channel, args}) instead of fetch().
#[tauri::command]
async fn ipc_proxy(channel: String, args: Vec<serde_json::Value>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let url = format!("http://127.0.0.1:3211/api/ipc/{}", channel);
    let body = serde_json::json!({ "args": args });

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("IPC proxy request failed: {e}"))?;

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("IPC proxy parse failed: {e}"))?;

    Ok(json)
}

/// Fire-and-forget IPC send (for listeners like overlay-data, set-ping-region)
#[tauri::command]
async fn ipc_send(channel: String, args: Vec<serde_json::Value>) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let url = format!("http://127.0.0.1:3211/api/ipc/{}", channel);
    let body = serde_json::json!({ "args": args });

    let _ = client.post(&url).json(&body).send().await;
    Ok(())
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

#[tauri::command]
fn set_minimize_to_tray(enabled: bool) {
    MINIMIZE_TO_TRAY.store(enabled, Ordering::SeqCst);
}

// ── App Entry Point ─────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Mutex::new(SidecarState {
            process: None,
        }))
        .invoke_handler(tauri::generate_handler![
            create_window,
            close_window,
            minimize_window,
            hide_window,
            show_window,
            set_ignore_mouse,
            create_overlay_window,
            stop_overlay_cursor_watch,
            ipc_proxy,
            ipc_send,
            start_sidecar,
            stop_sidecar,
            set_minimize_to_tray,
        ])
        .setup(|app| {
            // Enable minimize to tray
            MINIMIZE_TO_TRAY.store(true, Ordering::SeqCst);
            
            // Setup system tray
            if let Err(e) = setup_system_tray(app.handle()) {
                eprintln!("[tauri] Failed to setup system tray: {e}");
            }
            
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;

                match start_sidecar(handle.clone()).await {
                    Ok(status) => println!("[tauri] Sidecar auto-start: {status}"),
                    Err(e) => eprintln!("[tauri] Sidecar auto-start failed: {e}"),
                }

                // Wait for BOTH backend ports to be open (max 20s)
                // Port 3210: Express server (build endpoints, DDragon API)
                // Port 3211: IPC proxy server (ipcMain handlers, SSE events)
                // The IPC proxy starts AFTER main.cjs loads and whenReady fires,
                // so 3211 is always ready after 3210. We must wait for both.
                let ports_ready = tokio::time::timeout(std::time::Duration::from_secs(20), async {
                    let mut port_3210_ready = false;
                    let mut port_3211_ready = false;
                    for i in 0..40 {
                        if !port_3210_ready {
                            if let Ok(mut stream) = tokio::net::TcpStream::connect("127.0.0.1:3210").await {
                                use tokio::io::AsyncWriteExt;
                                let _ = stream.shutdown().await;
                                port_3210_ready = true;
                                println!("[tauri] Backend port 3210 is open (attempt {})", i + 1);
                            }
                        }
                        if !port_3211_ready {
                            if let Ok(mut stream) = tokio::net::TcpStream::connect("127.0.0.1:3211").await {
                                use tokio::io::AsyncWriteExt;
                                let _ = stream.shutdown().await;
                                port_3211_ready = true;
                                println!("[tauri] IPC proxy port 3211 is open (attempt {})", i + 1);
                            }
                        }
                        if port_3210_ready && port_3211_ready {
                            return true;
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                    // Log which ports failed
                    if !port_3210_ready { eprintln!("[tauri] Port 3210 never opened"); }
                    if !port_3211_ready { eprintln!("[tauri] Port 3211 never opened"); }
                    false
                }).await;

                if ports_ready.unwrap_or(false) {
                    println!("[tauri] Backend ready (both ports), showing window");
                } else {
                    eprintln!("[tauri] Backend not fully ready after 20s, showing window anyway");
                }

                // Emit event BEFORE showing window so frontend can start initialization
                let _ = handle.emit("backend-ready", true);
                println!("[tauri] Emitted backend-ready event");

                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    println!("[tauri] Main window shown");
                } else {
                    eprintln!("[tauri] Failed to get main window handle");
                }

                // Create the overlay window (hidden) so it's ready when a build is generated
                match create_overlay_window(handle.clone()).await {
                    Ok(()) => println!("[tauri] Overlay window auto-created"),
                    Err(e) => eprintln!("[tauri] Overlay window creation failed: {e}"),
                }

                // Start sidecar health check watchdog
                let watchdog_handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    start_sidecar_watchdog(watchdog_handle).await;
                });
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Handle minimize to tray instead of closing
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && MINIMIZE_TO_TRAY.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }
            }
            
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
