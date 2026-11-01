pub mod account;
pub mod adapters;
pub mod commands;
pub mod fsutil;
pub mod mcp;
pub mod market;
pub mod memory;
pub mod migrate;
pub mod modelfetch;
pub mod plugins;
pub mod providers;
pub mod quota;
pub mod store;
pub mod update;
pub mod usage;
pub mod zaccount;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// 关闭行为：true = 关到托盘（默认），false = 直接退出（设置岛可切换）
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

/// 主窗口显出并聚焦（托盘菜单 / 双击托盘共用）
fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        // 单实例必须最先注册：二次启动时唤起已有窗口而不是开新进程
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // 中央存储：~/.agenthub/agenthub.db（打开即迁移 schema）
            let store = store::Store::open().expect("初始化 ~/.agenthub 失败");
            app.manage(store);

            // 启动即后台全量+增量采集用量（不依赖页面打开；历史永久留存 ~/.agenthub/agenthub.db，
            // 卸载 zcode / workbuddy 后仍可查看）。独立 WAL 连接，不与 UI 抢锁。
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if let Ok(s2) = store::Store::open() {
                    let _ = usage::collect_all(&s2, Some(&handle));
                }
            });

            // 托盘：打开面板 / 退出；关闭行为 = 关到托盘（见 on_window_event）
            let open = MenuItem::with_id(app, "open", "打开面板", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            TrayIconBuilder::with_id("main-tray")
                .icon(
                    app.default_window_icon()
                        .expect("default window icon missing")
                        .clone(),
                )
                .tooltip("AgentHub")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_status,
            commands::run_skills_migration,
            commands::skills_overview,
            commands::relink_skill,
            commands::set_skill_enabled,
            commands::zcode_plugin_skills,
            commands::skill_delete,
            commands::recent_op_log,
            plugins::plugin_list,
            plugins::plugin_toggle,
            mcp::mcp_overview,
            mcp::mcp_adopt,
            mcp::mcp_save,
            mcp::mcp_toggle,
            mcp::mcp_delete,
            mcp::mcp_validate,
            providers::providers_overview,
            providers::provider_fetch_models,
            providers::provider_save,
            providers::provider_delete,
            providers::provider_set_default,
            account::wb_overview,
            account::wb_save_slot,
            account::wb_switch,
            account::wb_import_legacy,
            account::wb_delete_slot,
            account::wb_rename_slot,
            usage::usage_collect,
            usage::usage_overview,
            usage::usage_matrix,
            usage::usage_accounts,
            zaccount::zcode_overview,
            zaccount::zcode_save_slot,
            zaccount::zcode_switch,
            zaccount::zcode_delete_slot,
            zaccount::zcode_rename_slot,
            zaccount::zcode_launch,
            quota::zcode_quota,
            quota::wb_credit_summary,
            quota::wb_credit_by_account,
            quota::wb_credit_set_total,
            market::market_refresh,
            market::market_install,
            memory::memory_global_list,
            memory::memory_read,
            memory::memory_write,
            memory::memory_global_unify,
            memory::projects_overview,
            memory::project_init,
            memory::project_sync,
            memory::project_consolidate,
            commands::set_close_to_tray,
            update::update_check,
            update::update_install,
        ])
        .on_window_event(|window, event| {
            // 关闭行为：默认关到托盘（设置岛可切换为直接退出）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
