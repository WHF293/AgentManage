//! migrate —— M1 存储与迁移：从双 agent 现有 skill 目录导入中央仓库并重建软链。
//!
//! 背景（方案 §2 / §8.11）：cc-switch 已卸载，skills 现以实目录形态分别存在于
//! ~/.workbuddy/skills 与 ~/.zcode/skills。迁移 = 并集导入 ~/.agenthub/skills
//! → WB 逐项链 → ZCode 整目录链。所有被替换的实目录先备份。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::adapters::{self, wb, zcode};
use crate::fsutil::{self, LinkMode, Res};
use crate::store::{self, Store};

pub(crate) fn eq_path(a: &str, b: &str) -> bool {
    a.replace('/', "\\").to_lowercase() == b.replace('/', "\\").to_lowercase()
}

fn central_str() -> String {
    store::central_skills_dir().to_string_lossy().to_string()
}

pub fn parse_link_mode(pref: Option<&str>) -> LinkMode {
    match pref {
        Some("symlink") => LinkMode::Symlink,
        Some("junction") => LinkMode::Junction,
        Some("copy") => LinkMode::Copy,
        _ => fsutil::detect_link_mode(&store::hub_dir()),
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct ImportedSkill {
    pub name: String,
    /// 来源 agent（workbuddy / zcode / workbuddy+zcode）
    pub from: String,
    /// 双端并存时取了哪一侧（更新者胜出）
    pub took: String,
}

#[derive(Debug, Serialize)]
pub struct MigrateReport {
    pub central_dir: String,
    pub link_mode: String,
    pub imported: Vec<ImportedSkill>,
    /// 中央仓库已有且未变化的数量（幂等重跑时跳过复制）
    pub skipped_existing: usize,
    pub import_warnings: Vec<String>,
    pub wb_relinked: Vec<String>,
    pub wb_kept: Vec<String>,
    pub wb_failed: Vec<String>,
    /// zcode 整目录链动作：already-linked / relinked / replaced-with-link / created / failed:<err>
    pub zcode_action: String,
    pub warnings: Vec<String>,
}

/// 单个 skill 的候选（来自双端扫描）
struct Candidate {
    agent: &'static str,
    info: adapters::SkillDirInfo,
}

/// M1 主流程：导入 → WB 逐项链 → ZCode 整目录链 → 全程 op_log
pub fn migrate_skills(store: &Store, pref: Option<&str>) -> Res<MigrateReport> {
    store::ensure_hub_dirs()?;
    let backups = store::backups_dir();
    let mode = parse_link_mode(pref);
    let central = store::central_skills_dir();
    let mut warnings: Vec<String> = Vec::new();

    // 1) 扫描双端（只导入实目录；软链与断链不导入）
    let wb_scan = adapters::scan_skills_dir(&wb::skills_dir());
    let zc_scan = adapters::scan_skills_dir(&zcode::skills_dir());
    let mut candidates: BTreeMap<String, Vec<Candidate>> = BTreeMap::new();
    for info in wb_scan {
        if info.importable {
            candidates
                .entry(info.name.clone())
                .or_default()
                .push(Candidate { agent: "workbuddy", info });
        } else if info.is_link {
            warnings.push(format!(
                "WB 侧「{}」是软链（→ {}），跳过导入",
                info.name,
                info.link_target.as_deref().unwrap_or("?")
            ));
        }
    }
    for info in zc_scan {
        if info.importable {
            candidates
                .entry(info.name.clone())
                .or_default()
                .push(Candidate { agent: "zcode", info });
        } else if info.is_link {
            warnings.push(format!(
                "ZCode 侧「{}」是软链（→ {}），跳过导入",
                info.name,
                info.link_target.as_deref().unwrap_or("?")
            ));
        }
    }

    // 2) 并集导入中央仓库（双端并存取更新者；已有且未变化则跳过复制）
    let mut imported: Vec<ImportedSkill> = Vec::new();
    let mut skipped_existing: usize = 0;
    let mut import_warnings: Vec<String> = Vec::new();
    store.with(|conn| {
        for (name, cands) in &candidates {
            let best = cands
                .iter()
                .max_by_key(|c| c.info.mtime_ms)
                .expect("candidates 非空");
            let dest = central.join(name);
            let dest_mtime_ms = std::fs::metadata(&dest)
                .ok()
                .and_then(|md| md.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let need_copy = !dest.is_dir() || best.info.mtime_ms > dest_mtime_ms;
            if need_copy {
                if dest.exists() {
                    fsutil::move_dir_to_backup(&dest, &backups).map_err(|e| {
                        format!("中央仓库既有「{name}」备份失败: {e}")
                    })?;
                }
                if let Err(e) = fsutil::copy_dir_recursive(Path::new(&best.info.path), &dest) {
                    import_warnings.push(format!("「{name}」导入失败: {e}"));
                    continue;
                }
            }
            let (_, description) = fsutil::parse_skill_md(&dest.join("SKILL.md"));
            let desc = description.or(best.info.description.clone());
            let sources: Vec<&str> = cands.iter().map(|c| c.agent).collect();
            let id = store::upsert_skill(
                conn,
                name,
                &dest.to_string_lossy(),
                desc.as_deref(),
                "migrate",
                &sources.join("+"),
            )?;
            for agent in &sources {
                store::upsert_skill_link(conn, id, agent, mode.as_str(), "", "pending")?;
            }
            if need_copy {
                let from = sources.join("+");
                let took = if cands.len() > 1 {
                    format!("{}（更新者）", best.agent)
                } else {
                    best.agent.to_string()
                };
                imported.push(ImportedSkill {
                    name: name.clone(),
                    from,
                    took,
                });
            } else {
                skipped_existing += 1;
            }
        }
        store::log_op(
            conn,
            "skills.import",
            &central.to_string_lossy(),
            serde_json::json!({
                "imported": imported.len(),
                "skipped": skipped_existing,
                "warnings": import_warnings,
            }),
        );
        Ok(())
    })?;

    // 3) WB：逐项链
    let central_list = adapters::scan_skills_dir(&central);
    let mut wb_relinked = Vec::new();
    let mut wb_kept = Vec::new();
    let mut wb_failed = Vec::new();
    store.with(|conn| {
        for info in &central_list {
            match relink_wb_skill(&info.name, &central, &backups, mode) {
                Ok(true) => wb_relinked.push(info.name.clone()),
                Ok(false) => wb_kept.push(info.name.clone()),
                Err(e) => {
                    wb_failed.push(info.name.clone());
                    warnings.push(format!("WB「{}」建链失败: {e}", info.name));
                    continue;
                }
            }
            if let Ok(id) = fetch_skill_id(conn, &info.name) {
                let _ = store::upsert_skill_link(
                    conn,
                    id,
                    "workbuddy",
                    mode.as_str(),
                    &wb::skills_dir().join(&info.name).to_string_lossy(),
                    if wb_failed.contains(&info.name) { "broken" } else { "ok" },
                );
            }
        }
        Ok(())
    })?;

    // 4) ZCode：整目录链（替换 ~/.zcode/skills 前其内容已全部并入中央仓库）
    let zcode_action = match ensure_zcode_whole_link(&central, &backups, mode) {
        Ok(action) => action,
        Err(e) => {
            warnings.push(format!("ZCode 整目录链失败: {e}"));
            format!("failed:{e}")
        }
    };
    store.with(|conn| {
        for info in &central_list {
            if let Ok(id) = fetch_skill_id(conn, &info.name) {
                let _ = store::upsert_skill_link(
                    conn,
                    id,
                    "zcode",
                    &format!("whole-{}", mode.as_str()),
                    &zcode::skills_dir().to_string_lossy(),
                    if zcode_action.starts_with("failed") { "broken" } else { "ok" },
                );
            }
        }
        store::log_op(
            conn,
            "skills.migrate",
            &central.to_string_lossy(),
            serde_json::json!({
                "imported": imported.len(),
                "wb_relinked": wb_relinked.len(),
                "wb_failed": wb_failed.len(),
                "zcode": zcode_action,
                "link_mode": mode.as_str(),
            }),
        );
        Ok(())
    })?;

    Ok(MigrateReport {
        central_dir: central_str(),
        link_mode: mode.as_str().to_string(),
        imported,
        skipped_existing,
        import_warnings,
        wb_relinked,
        wb_kept,
        wb_failed,
        zcode_action,
        warnings,
    })
}

fn fetch_skill_id(conn: &rusqlite::Connection, name: &str) -> Res<i64> {
    conn.query_row(
        "SELECT id FROM skills WHERE name = ?1",
        rusqlite::params![name],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|e| e.to_string())
}

/// WB 单 skill 建链：返回 true = 本次重建，false = 本就指向中央仓库无需动作
pub fn relink_wb_skill(name: &str, central: &Path, backups: &Path, mode: LinkMode) -> Res<bool> {
    let central_skill = central.join(name);
    let target = wb::skills_dir().join(name);
    if fsutil::is_link(&target) {
        if fsutil::link_target(&target)
            .map(|t| eq_path(&t.to_string_lossy(), &central_skill.to_string_lossy()))
            .unwrap_or(false)
        {
            return Ok(false);
        }
        std::fs::remove_dir(&target).map_err(|e| format!("移除旧链接失败: {e}"))?;
    } else if target.exists() {
        fsutil::move_dir_to_backup(&target, backups)?;
    }
    std::fs::create_dir_all(wb::skills_dir()).map_err(|e| e.to_string())?;
    fsutil::make_dir_link(&target, &central_skill, mode)?;
    Ok(true)
}

/// ZCode 整目录链：~/.zcode/skills → ~/.agenthub/skills
pub fn ensure_zcode_whole_link(central: &Path, backups: &Path, mode: LinkMode) -> Res<String> {
    let zdir = zcode::skills_dir();
    let central_str = central.to_string_lossy().to_string();
    if fsutil::is_link(&zdir) {
        if fsutil::link_target(&zdir)
            .map(|t| eq_path(&t.to_string_lossy(), &central_str))
            .unwrap_or(false)
        {
            return Ok("already-linked".into());
        }
        std::fs::remove_dir(&zdir).map_err(|e| format!("移除旧整链失败: {e}"))?;
        fsutil::make_dir_link(&zdir, central, mode)?;
        return Ok("relinked".into());
    }
    if zdir.is_dir() {
        // 防御：确认目录内所有实目录 skill 都已入中央仓库再腾挪
        for info in adapters::scan_skills_dir(&zdir) {
            if info.importable && !central.join(&info.name).is_dir() {
                let dest = central.join(&info.name);
                fsutil::copy_dir_recursive(Path::new(&info.path), &dest)
                    .map_err(|e| format!("补导「{}」失败: {e}", info.name))?;
            }
        }
        fsutil::move_dir_to_backup(&zdir, backups)?;
        fsutil::make_dir_link(&zdir, central, mode)?;
        return Ok("replaced-with-link".into());
    }
    std::fs::create_dir_all(zdir.parent().unwrap()).map_err(|e| e.to_string())?;
    fsutil::make_dir_link(&zdir, central, mode)?;
    Ok("created".into())
}

/// 供命令层：单 skill 状态判定
pub fn link_status_for(entry_path: &Path, central_skill: &Path) -> String {
    if fsutil::is_link(entry_path) {
        let matches = fsutil::link_target(entry_path)
            .map(|t| eq_path(&t.to_string_lossy(), &central_skill.to_string_lossy()))
            .unwrap_or(false);
        if matches {
            "linked".into()
        } else {
            "broken".into()
        }
    } else if entry_path.is_dir() {
        "diverged".into()
    } else {
        "missing".into()
    }
}

/// 供命令层：中央仓库快照路径
#[allow(dead_code)]
pub fn central_path_of(name: &str) -> PathBuf {
    store::central_skills_dir().join(name)
}
