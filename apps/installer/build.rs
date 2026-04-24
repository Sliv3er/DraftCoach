fn main() {
    #[cfg(windows)]
    {
        println!("cargo:rustc-link-lib=dylib=advapi32");
        println!("cargo:rustc-link-lib=dylib=ole32");
        println!("cargo:rustc-link-lib=dylib=oleaut32");
        println!("cargo:rustc-link-lib=dylib=user32");
        println!("cargo:rustc-link-lib=dylib=dwmapi");
        println!("cargo:rustc-link-lib=dylib=shlwapi");
        println!("cargo:rustc-link-arg=/SUBSYSTEM:WINDOWS");
        println!("cargo:rustc-link-arg=/ENTRY:mainCRTStartup");

        // ── Embed application icon into .exe ──────────────────────
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let icon_path = std::path::Path::new(&manifest_dir)
            .join("..").join("..").join("assets").join("icon.ico");
        let icon_abs = std::fs::canonicalize(&icon_path)
            .unwrap_or_else(|_| icon_path.clone());
        let icon_str = icon_abs.to_string_lossy()
            .replace("\\\\?\\", "")
            .replace('\\', "\\\\");
        let rc_content = format!("1 ICON \"{}\"", icon_str);
        let rc_path = std::path::Path::new(&manifest_dir).join("icon.rc");
        std::fs::write(&rc_path, &rc_content).unwrap();
        let _ = embed_resource::compile(&rc_path, embed_resource::NONE);

        // ── Copy NSIS installer to known location for include_bytes! ──
        let nsis_dir = std::path::Path::new(&manifest_dir)
            .join("..").join("desktop-tauri").join("src-tauri")
            .join("target").join("release").join("bundle").join("nsis");
        let dest = std::path::Path::new(&manifest_dir).join("embedded-setup.exe");

        if let Ok(entries) = std::fs::read_dir(&nsis_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with("-setup.exe") && name.starts_with("DraftCoach") {
                    if let Err(e) = std::fs::copy(entry.path(), &dest) {
                        println!("cargo:warning=Failed to copy NSIS installer: {}", e);
                    } else {
                        println!("cargo:warning=Embedded NSIS installer: {}", name);
                    }
                    break;
                }
            }
        }

        if !dest.exists() {
            // Create a placeholder so include_bytes! doesn't fail during dev
            println!("cargo:warning=NSIS installer not found! Creating empty placeholder.");
            std::fs::write(&dest, b"").unwrap();
        }

        // Rerun if the NSIS installer changes
        println!("cargo:rerun-if-changed=embedded-setup.exe");
    }
}
