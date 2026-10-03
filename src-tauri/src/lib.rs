use tauri::Manager;

use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

const BACKEND_ADDR: &str = "127.0.0.1:8000";

/// True while audio is playing or the player is popped out: closing the window then hides it to the
/// tray instead of quitting, so the listening carries on.
struct KeepAlive(AtomicBool);

#[tauri::command]
fn set_keep_alive(state: tauri::State<KeepAlive>, value: bool) {
    state.0.store(value, Ordering::Relaxed);
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let open = MenuItem::with_id(app, "open", "Open Subvocal", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Subvocal")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// The backend process the app started (none when one was already running, or in development).
struct Backend(Mutex<Option<Child>>);

fn backend_is_up() -> bool {
    let addr: SocketAddr = BACKEND_ADDR.parse().unwrap();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Starts the packaged backend that ships inside the app. Skipped when something already answers on
/// the backend port (for example a backend you started yourself) and in development builds.
fn start_backend(app: &tauri::AppHandle) -> Option<Child> {
    if cfg!(debug_assertions) || backend_is_up() {
        return None;
    }
    let dir: PathBuf = app.path().resource_dir().ok()?.join("backend");
    let exe = dir.join(if cfg!(windows) { "subvocal-backend.exe" } else { "subvocal-backend" });
    if !exe.exists() {
        eprintln!("backend not found at {}", exe.display());
        return None;
    }
    let mut cmd = Command::new(exe);
    cmd.current_dir(&dir).env("SUBVOCAL_PARENT_PID", std::process::id().to_string());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    match cmd.spawn() {
        Ok(child) => Some(child),
        Err(e) => {
            eprintln!("could not start the backend: {e}");
            None
        }
    }
}

/// Starts the desktop shell. The app is the React frontend plus the Python backend, which the
/// shell starts on launch and stops on exit.
pub fn run() {
    let app = tauri::Builder::default()
        .manage(Backend(Mutex::new(None)))
        .manage(KeepAlive(AtomicBool::new(false)))
        .invoke_handler(tauri::generate_handler![set_keep_alive])
        .setup(|app| {
            build_tray(app)?;
            let child = start_backend(app.handle());
            *app.state::<Backend>().0.lock().unwrap() = child;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window while audio plays (or the player is popped out) hides it to the
            // tray so listening carries on. Otherwise closing it quits the app.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    if app.state::<KeepAlive>().0.load(Ordering::Relaxed) {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        app.exit(0);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Subvocal");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(mut child) = handle.state::<Backend>().0.lock().unwrap().take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    });
}
