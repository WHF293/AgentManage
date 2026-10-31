//! commands —— Tauri IPC 命令层（M1/M2：状态探测、迁移、skills 总览、重建链接）。

use std::collections::HashMap;

use serde::Serialize;
use tauri::State;

use crate::adapters::{self, wb, zcode};
use crate::fsutil;
use crate::migrate;
use crate::store::{self, Store};

#[derive(Serialize)]
pub struct AgentStatus {
    pub installed: bool,
    pub skills_dir: String,
    pub skills_dir_is_link: bool,
    pub skills_dir_target: Option<String>,
    pub skills_count: usize,
}

#[derive(Serialize)]
pub struct AppStatus {
    pub hub_initialized: bool,
    pub central_skills_count: usize,
    pub link_mode: String,
    pub workbuddy: AgentStatus,
    pub zcode: AgentStatus,
    pub auth_info_found: bool,
}

fn agent_status(installed: bool, skills_dir: &std::path::Path) -> AgentStatus {
    let is_link = fsutil::is_link(skills_dir);
    let skills_count = if is_link || skills_dir.is_dir() {
        adapters::scan_skills_dir(skills_dir).len()
    } else {
        0
    };
    AgentStatus {
        installed,
        skills_dir: skills_dir.to_string_lossy().to_string(),
        skills_dir_is_link: is_link,
        skills_dir_target: fsutil::link_target(skills_dir).map(|p| p.to_string_lossy().to_string()),
        skills_count,
    }
}

/// 启动探测：中央仓库 / 双端安装态 / 链接策略 / 登录态文件
#[tauri::command]
pub fn app_status() -> AppStatus {
    store::ensure_hub_dirs().ok();
    AppStatus {
        hub_initialized: store::db_path().exists(),
        central_skills_count: adapters::scan_skills_dir(&store::central_skills_dir()).len(),
        link_mode: migrate::parse_link_mode(None).as_str().to_string(),
        workbuddy: agent_status(wb::installed(), &wb::skills_dir()),
        zcode: agent_status(zcode::installed(), &zcode::skills_dir()),
        auth_info_found: wb::auth_info().is_some(),
    }
}

/// M1 一键迁移：双端 skills 并集导入中央仓库 → WB 逐项链 → ZCode 整目录链
#[tauri::command]
pub fn run_skills_migration(
    store_state: State<'_, Store>,
    mode: Option<String>,
) -> Result<migrate::MigrateReport, String> {
    migrate::migrate_skills(&store_state, mode.as_deref())
}

/// skill 每行在每端的状态：linked / diverged（实目录）/ broken（断链）/ missing
#[derive(Serialize)]
pub struct SkillOverviewItem {
    pub name: String,
    pub description: Option<String>,
    pub source: String,
    pub source_ref: Option<String>,
    pub enabled: bool,
    pub wb: String,
    pub zcode: String,
    /// zcode 是否处于「整目录链」模式（此时单 skill 状态恒为 linked）
    pub zcode_whole_link: bool,
}

#[tauri::command]
pub fn skills_overview(store_state: State<'_, Store>) -> Result<Vec<SkillOverviewItem>, String> {
    store::ensure_hub_dirs()?;
    let central = store::central_skills_dir();
    let central_list = adapters::scan_skills_dir(&central);
    let zdir = zcode::skills_dir();
    let zwhole = fsutil::is_link(&zdir)
        && fsutil::link_target(&zdir)
            .map(|t| {
                t.to_string_lossy().to_lowercase() == central.to_string_lossy().to_lowercase()
            })
            .unwrap_or(false);

    // DB 元数据（enabled / source / source_ref）
    let (enabled_map, source_map, srcref_map) = store_state.with(|conn| {
        let mut stmt = conn
            .prepare("SELECT name, IFNULL(enabled,1), IFNULL(source,''), source_ref FROM skills")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)? != 0,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut en = HashMap::new();
        let mut src = HashMap::new();
        let mut srf = HashMap::new();
        for r in rows {
            let (n, e, s, rf) = r.map_err(|e| e.to_string())?;
            en.insert(n.clone(), e);
            src.insert(n.clone(), s);
            srf.insert(n, rf);
        }
        Ok((en, src, srf))
    })?;

    let mut items = Vec::new();
    for info in central_list {
        let central_skill = central.join(&info.name);
        let wb_status = migrate::link_status_for(&wb::skills_dir().join(&info.name), &central_skill);
        let zcode_status = if zwhole {
            "linked".to_string()
        } else {
            migrate::link_status_for(&zdir.join(&info.name), &central_skill)
        };
        let name = info.name.clone();
        items.push(SkillOverviewItem {
            name,
            description: info.description.clone(),
            enabled: *enabled_map.get(&info.name).unwrap_or(&true),
            source: source_map.get(&info.name).cloned().unwrap_or_default(),
            source_ref: srcref_map.get(&info.name).cloned().flatten(),
            wb: wb_status,
            zcode: zcode_status,
            zcode_whole_link: zwhole,
        });
    }
    Ok(items)
}

/// 单 skill 在单端重建链接（断链修复 / 分发）
#[tauri::command]
pub fn relink_skill(
    store_state: State<'_, Store>,
    name: String,
    agent: String,
) -> Result<String, String> {
    let central = store::central_skills_dir();
    let central_skill = central.join(&name);
    if !central_skill.is_dir() {
        return Err(format!("中央仓库无此 skill：{name}"));
    }
    let mode = migrate::parse_link_mode(None);
    let backups = store::backups_dir();
    let status = match agent.as_str() {
        "workbuddy" => {
            migrate::relink_wb_skill(&name, &central, &backups, mode)?;
            "linked"
        }
        "zcode" => {
            let action = migrate::ensure_zcode_whole_link(&central, &backups, mode)?;
            if action.starts_with("failed") {
                return Err(action);
            }
            "linked"
        }
        other => return Err(format!("未知 agent：{other}")),
    };
    // 落库 + op_log
    store_state.with(|conn| {
        let id: Option<i64> = conn
            .query_row(
                "SELECT id FROM skills WHERE name = ?1",
                rusqlite::params![name],
                |row| row.get(0),
            )
            .ok();
        if let Some(id) = id {
            let target = match agent.as_str() {
                "workbuddy" => wb::skills_dir().join(&name),
                _ => zcode::skills_dir(),
            };
            let mode_str = if agent == "zcode" {
                format!("whole-{}", mode.as_str())
            } else {
                mode.as_str().to_string()
            };
            store::upsert_skill_link(
                conn,
                id,
                &agent,
                &mode_str,
                &target.to_string_lossy(),
                "ok",
            )?;
        }
        store::log_op(
            conn,
            "skill.relink",
            &name,
            serde_json::json!({ "agent": agent, "status": status }),
        );
        Ok(())
    })?;
    Ok(status.to_string())
}

/// 启停 skill（M2：DB 状态 + UI；写穿 WB skillOverrides / zcode 在 M2 细化）
#[tauri::command]
pub fn set_skill_enabled(store_state: State<'_, Store>, name: String, enabled: bool) -> Result<(), String> {
    store_state.with(|conn| {
        conn.execute(
            "UPDATE skills SET enabled = ?2, updated_at = datetime('now','localtime') WHERE name = ?1",
            rusqlite::params![name, enabled as i64],
        )
        .map_err(|e| e.to_string())?;
        store::log_op(
            conn,
            "skill.set_enabled",
            &name,
            serde_json::json!({ "enabled": enabled }),
        );
        Ok(())
    })
}

/// 最近操作日志（总览岛「最近操作」行）
#[derive(Serialize)]
pub struct OpLogRow {
    pub id: i64,
    pub action: String,
    pub target: Option<String>,
    pub detail_json: Option<String>,
    pub created_at: Option<String>,
}

#[tauri::command]
pub fn recent_op_log(store_state: State<'_, Store>, limit: i64) -> Result<Vec<OpLogRow>, String> {
    store_state.with(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, action, target, detail_json, created_at FROM op_log
                 ORDER BY id DESC LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![limit.clamp(1, 200)], |row| {
                Ok(OpLogRow {
                    id: row.get(0)?,
                    action: row.get(1)?,
                    target: row.get(2)?,
                    detail_json: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

/// 关闭行为切换：true = 关到托盘（默认），false = 直接退出（设置岛）
#[tauri::command]
pub fn set_close_to_tray(enabled: bool) {
    crate::CLOSE_TO_TRAY.store(enabled, std::sync::atomic::Ordering::Relaxed);
}
