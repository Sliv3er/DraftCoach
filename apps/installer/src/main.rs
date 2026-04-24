//! DraftCoach Premium Installer — WebView2 Wrapper

use serde::Deserialize;
use std::env;
use std::fs;
use std::process::Command;
use std::sync::{Arc, Mutex};
use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::WindowBuilder;
use wry::WebViewBuilder;

const HTML_TEMPLATE: &str = include_str!("../ui/index.html");
const CSS: &str = include_str!("../ui/styles.css");
const JS: &str = include_str!("../ui/installer.js");
const ICON_PNG: &[u8] = include_bytes!("../../../assets/icon-128.png");

/// The NSIS installer binary, embedded at compile time by build.rs
const NSIS_SETUP: &[u8] = include_bytes!("../embedded-setup.exe");

enum UiCmd {
    Eval(String),
    Minimize,
    Close,
}

/// Extract the embedded NSIS installer to a temp file and return its path
fn extract_nsis_installer() -> Result<std::path::PathBuf, String> {
    if NSIS_SETUP.is_empty() {
        return Err("No installer embedded. Rebuild after running the Tauri NSIS build.".into());
    }
    let temp = env::temp_dir().join("DraftCoach_setup.exe");
    fs::write(&temp, NSIS_SETUP)
        .map_err(|e| format!("Failed to extract installer: {}", e))?;
    Ok(temp)
}

fn default_install_dir() -> String {
    let local = env::var("LOCALAPPDATA")
        .unwrap_or_else(|_| env::var("APPDATA").unwrap_or("C:\\Users".into()));
    format!("{}\\DraftCoach", local)
}

#[derive(Deserialize)]
struct IpcMessage {
    cmd: String,
    #[serde(default)]
    data: serde_json::Value,
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 { result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char); }
        else { result.push('='); }
        if chunk.len() > 2 { result.push(CHARS[(triple & 0x3F) as usize] as char); }
        else { result.push('='); }
    }
    result
}

fn build_html() -> String {
    let icon_b64 = format!("data:image/png;base64,{}", base64_encode(ICON_PNG));
    HTML_TEMPLATE
        .replace("STYLES_PLACEHOLDER", CSS)
        .replace("SCRIPT_PLACEHOLDER", JS)
        .replace("ICON_DATA_URI", &icon_b64)
}

/// Embed the .ico file for Win32 API loading
const ICON_ICO: &[u8] = include_bytes!("../../../assets/icon.ico");

fn main() {
    let event_loop = EventLoop::new();

    let builder = WindowBuilder::new()
        .with_title("DraftCoach Setup")
        .with_inner_size(LogicalSize::new(920.0, 580.0))
        .with_resizable(false)
        .with_decorations(false);

    let window = builder.build(&event_loop).expect("Failed to create window");

    // Center on screen
    if let Some(monitor) = window.primary_monitor() {
        let screen = monitor.size();
        let win = window.outer_size();
        let x = (screen.width.saturating_sub(win.width)) / 2;
        let y = (screen.height.saturating_sub(win.height)) / 2;
        window.set_outer_position(PhysicalPosition::new(x as i32, y as i32));
    }

    // Set dark title bar + taskbar icon via Win32 API
    #[cfg(windows)]
    {
        use tao::platform::windows::WindowExtWindows;
        let hwnd = window.hwnd();
        unsafe {
            use winapi::um::dwmapi::DwmSetWindowAttribute;
            use winapi::um::winuser::{
                LoadImageW, SendMessageW,
                IMAGE_ICON, LR_LOADFROMFILE, LR_DEFAULTSIZE,
                WM_SETICON, ICON_BIG, ICON_SMALL,
            };

            // Dark title bar
            let dark: u32 = 1;
            DwmSetWindowAttribute(hwnd as _, 20, &dark as *const u32 as *const _, 4);

            // Write .ico to temp, load via Win32, set on window
            let temp = env::temp_dir().join("draftcoach_setup.ico");
            if fs::write(&temp, ICON_ICO).is_ok() {
                let wide_path: Vec<u16> = temp.to_string_lossy()
                    .encode_utf16().chain(std::iter::once(0)).collect();
                let hicon = LoadImageW(
                    std::ptr::null_mut(),
                    wide_path.as_ptr(),
                    IMAGE_ICON,
                    0, 0,
                    LR_LOADFROMFILE | LR_DEFAULTSIZE,
                );
                if !hicon.is_null() {
                    SendMessageW(hwnd as _, WM_SETICON, ICON_BIG as _, hicon as _);
                    SendMessageW(hwnd as _, WM_SETICON, ICON_SMALL as _, hicon as _);
                }
            }
        }
    }

    let cmd_queue: Arc<Mutex<Vec<UiCmd>>> = Arc::new(Mutex::new(Vec::new()));
    let cmd_q = cmd_queue.clone();
    let html = build_html();

    let webview = WebViewBuilder::new()
        .with_html(&html)
        .with_ipc_handler(move |request: wry::http::Request<String>| {
            let body = request.body();
            if let Ok(msg) = serde_json::from_str::<IpcMessage>(body) {
                let q = cmd_q.clone();
                match msg.cmd.as_str() {
                    "get_default_dir" => {
                        let dir = default_install_dir().replace('\\', "\\\\");
                        q.lock().unwrap().push(UiCmd::Eval(
                            format!("onMessage({{event:'set_dir',data:{{path:'{}'}}}})", dir)
                        ));
                    }
                    "browse" => {
                        let dir = default_install_dir().replace('\\', "\\\\");
                        q.lock().unwrap().push(UiCmd::Eval(
                            format!("onMessage({{event:'set_dir',data:{{path:'{}'}}}})", dir)
                        ));
                    }
                    "install" => {
                        let path = msg.data.get("path")
                            .and_then(|v| v.as_str())
                            .unwrap_or(&default_install_dir())
                            .to_string();
                        let q2 = q.clone();
                        std::thread::spawn(move || run_install(&path, q2));
                    }
                    "launch" => {
                        let exe = format!("{}\\draftcoach.exe", default_install_dir());
                        let _ = Command::new(&exe).spawn();
                        std::process::exit(0);
                    }
                    "minimize" => { q.lock().unwrap().push(UiCmd::Minimize); }
                    "cancel" | "close" => { q.lock().unwrap().push(UiCmd::Close); }
                    _ => {}
                }
            }
        })
        .with_devtools(cfg!(debug_assertions))
        .build(&window)
        .expect("Failed to create WebView");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::WaitUntil(
            std::time::Instant::now() + std::time::Duration::from_millis(30)
        );
        match event {
            Event::WindowEvent { event: WindowEvent::CloseRequested, .. } => {
                *control_flow = ControlFlow::Exit;
            }
            Event::MainEventsCleared => {
                let cmds: Vec<UiCmd> = cmd_queue.lock().unwrap().drain(..).collect();
                for cmd in cmds {
                    match cmd {
                        UiCmd::Eval(js) => { let _ = webview.evaluate_script(&js); }
                        UiCmd::Minimize => { window.set_minimized(true); }
                        UiCmd::Close => { *control_flow = ControlFlow::Exit; }
                    }
                }
            }
            _ => {}
        }
    });
}

fn run_install(install_dir: &str, q: Arc<Mutex<Vec<UiCmd>>>) {
    let send = |js: String| { q.lock().unwrap().push(UiCmd::Eval(js)); };

    send("onMessage({event:'progress',data:{percent:2,status:'Extracting installer...'}})".into());

    let nsis = match extract_nsis_installer() {
        Ok(p) => p,
        Err(msg) => {
            let safe = msg.replace('\'', "\\'");
            send(format!("onMessage({{event:'install_error',data:{{message:'{}'}}}})", safe));
            return;
        }
    };

    send("onMessage({event:'progress',data:{percent:8,status:'Starting installation...'}})".into());

    match Command::new(&nsis).args(&["/S", &format!("/D={}", install_dir)]).status() {
        Ok(s) if s.success() => {
            // Clean up temp file
            let _ = fs::remove_file(&nsis);
            send("onMessage({event:'progress',data:{percent:100,status:'Done!'}})".into());
            std::thread::sleep(std::time::Duration::from_millis(500));
            send("onMessage({event:'install_complete',data:{}})".into());
        }
        Ok(s) => {
            let _ = fs::remove_file(&nsis);
            let c = s.code().unwrap_or(-1);
            send(format!("onMessage({{event:'install_error',data:{{message:'Exit code {}'}}}})", c));
        }
        Err(e) => {
            let _ = fs::remove_file(&nsis);
            send(format!("onMessage({{event:'install_error',data:{{message:'{}'}}}})",
                e.to_string().replace('\'', "\\'")));
        }
    }
}
