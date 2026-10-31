//! memory —— M6 记忆管理：全局记忆（双账号 / ZCode）+ 项目记忆 .ai/ 桥接。
//!
//! 全局：WB memory/<uid>_memory.md 与 user-<uid>-personal/MEMORY.md 可编辑（写前备份）；
//!       ZCode AGENTS.md 默认只读，显式解锁后才写。
//! 项目：.ai/ 统一记忆 + 指令文件幂等桥接块（init / sync 漂移检测 / consolidate 蒸馏），
//!       方案 §4 定版；不碰各 App 内部记忆目录。

use std::path::{Path, PathBuf};

use chrono::TimeZone;
use serde::Serialize;

use crate::adapters::{agent_home, wb, zcode};
use crate::fsutil::{self, Res};
use crate::store::{self, Store};

pub const BLOCK_START: &str = "<!-- agent-hub:start -->";
pub const BLOCK_END: &str = "<!-- agent-hub:end -->";
pub const BRIDGE_BLOCK: &str = "<!-- agent-hub:start -->
本项目所有 AI agent 共享记忆位于 `.ai/`：
- 开始任务前，先读 `.ai/MEMORY.md` 和最近几天的 `.ai/memory/` 日志
- 完成实质工作后，把做了什么/为什么追加到 `.ai/memory/YYYY-MM-DD.md`
- 稳定的项目约定写入 `.ai/PROJECT.md`
<!-- agent-hub:end -->";

/// FNV-1a 64：零依赖稳定 hash（桥接块漂移指纹）
fn fnv1a(data: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in data.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

// ─── 全局记忆 ───

#[derive(Debug, Serialize)]
pub struct MemoryFile {
    pub id: String,
    pub label: String,
    pub path: String,
    pub agent: String,
    /// ZCode AGENTS.md 默认只读
    pub readonly_default: bool,
    pub size: u64,
    pub updated: String,
}

fn file_meta(p: &Path, id: &str, label: &str, agent: &str, ro: bool) -> Option<MemoryFile> {
    let md = std::fs::metadata(p).ok()?;
    let updated = md
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| {
            chrono::Local
                .timestamp_opt(d.as_secs() as i64, 0)
                .single()
                .map(|t| t.format("%Y-%m-%d %H:%M").to_string())
                .unwrap_or_default()
        })
        .unwrap_or_default();
    Some(MemoryFile {
        id: id.to_string(),
        label: label.to_string(),
        path: p.to_string_lossy().to_string(),
        agent: agent.to_string(),
        readonly_default: ro,
        size: md.len(),
        updated,
    })
}

pub fn global_files() -> Vec<MemoryFile> {
    let mut out = Vec::new();
    // WB：按账号 memory/<uid>_memory.md
    if let Ok(entries) = std::fs::read_dir(wb::memory_dir()) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.ends_with("_memory.md") && e.path().is_file() {
                let uid = name.trim_end_matches("_memory.md").to_string();
                if let Some(f) = file_meta(
                    &e.path(),
                    &format!("wb-{uid}"),
                    &format!("WB · {} · memory.md", &uid[..uid.len().min(8)]),
                    "workbuddy",
                    false,
                ) {
                    out.push(f);
                }
            }
        }
    }
    // WB：user-<uid>-personal/MEMORY.md
    for uid in wb::user_dirs() {
        let p = wb::dir().join(&uid).join("MEMORY.md");
        if p.is_file() {
            if let Some(f) = file_meta(
                &p,
                &format!("wb-user-{uid}"),
                &format!("WB · {} · MEMORY.md（用户级）", &uid[5..13]),
                "workbuddy",
                false,
            ) {
                out.push(f);
            }
        }
    }
    // ZCode：AGENTS.md（默认只读）
    let agents = zcode::agents_md();
    if agents.is_file() {
        if let Some(f) = file_meta(&agents, "zcode-agents", "ZCode · AGENTS.md", "zcode", true) {
            out.push(f);
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

/// 路径安全：只允许 ~/.workbuddy、~/.zcode 与已注册项目目录
fn allowed_root_of(path: &Path, store: &Store) -> Option<PathBuf> {
    let candidates = [
        wb::dir(),
        zcode::dir(),
    ];
    let canon = |p: &Path| std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
    let target = canon(path);
    for root in &candidates {
        if target.starts_with(canon(root)) {
            return Some(root.clone());
        }
    }
    // 注册项目目录
    let ok = store
        .with(|conn| {
            let mut stmt = conn
                .prepare("SELECT path FROM projects")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            let mut paths = Vec::new();
            for r in rows {
                paths.push(r.map_err(|e| e.to_string())?);
            }
            Ok(paths)
        })
        .unwrap_or_default();
    for p in ok {
        if target.starts_with(canon(Path::new(&p))) {
            return Some(PathBuf::from(p));
        }
    }
    None
}

pub fn read_global(store: &Store, path: &str) -> Res<String> {
    let p = Path::new(path);
    if allowed_root_of(p, store).is_none() {
        return Err(format!("路径不在允许范围：{path}"));
    }
    std::fs::read_to_string(p).map_err(|e| format!("读取失败: {e}"))
}

#[derive(Debug, serde::Deserialize)]
pub struct WriteMemoryInput {
    pub path: String,
    pub content: String,
    /// ZCode AGENTS.md 需显式解锁
    pub allow_zcode_agents: bool,
}

pub fn write_global(store: &Store, input: &WriteMemoryInput) -> Res<()> {
    let p = Path::new(&input.path);
    let root = allowed_root_of(p, store).ok_or_else(|| format!("路径不在允许范围：{}", input.path))?;
    let is_zcode_agents = p == zcode::agents_md();
    if is_zcode_agents && !input.allow_zcode_agents {
        return Err("ZCode AGENTS.md 默认只读（避免与 ZCode 自身写入冲突），请先解锁".into());
    }
    let _ = root;
    let backup_dir = store::backups_dir().join("memory");
    if p.exists() {
        fsutil::backup_file(p, &backup_dir)?;
    }
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fsutil::atomic_write(p, input.content.as_bytes())?;
    store.with(|conn| {
        store::log_op(
            conn,
            "memory.write",
            &input.path,
            serde_json::json!({ "bytes": input.content.len() }),
        );
        Ok(())
    })
}

// ─── 项目记忆 .ai/ 桥接 ───

#[derive(Debug, Serialize)]
pub struct BridgeStatus {
    pub file: String,
    pub injected: bool,
    pub drifted: bool,
}

#[derive(Debug, Serialize)]
pub struct ProjectInfo {
    pub path: String,
    pub name: String,
    /// .ai/ 是否就绪
    pub ai_ready: bool,
    pub bridges: Vec<BridgeStatus>,
    /// 蒸馏候选条数（各 agent 自动沉淀中未入 .ai 的）
    pub consolidate_candidates: usize,
}

fn project_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn ensure_projects_from_agents(store: &Store) -> Res<()> {
    let mut paths: Vec<String> = Vec::new();
    // ZCode recentProjects（字符串数组）
    if let Ok(bytes) = std::fs::read(zcode::v2_setting()) {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            if let Some(arr) = v.get("recentProjects").and_then(|x| x.as_array()) {
                for p in arr {
                    if let Some(s) = p.as_str() {
                        paths.push(s.to_string());
                    }
                }
            }
        }
    }
    // WB：sessions.cwd 按出现次数排序（排除临时缓存目录）
    let db = wb::dir().join("workbuddy.db");
    if db.is_file() {
        if let Ok(conn) = rusqlite::Connection::open_with_flags(
            &db,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        ) {
            let mut stmt = conn
                .prepare(
                    "SELECT cwd, COUNT(*) AS c FROM sessions
                     WHERE IFNULL(cwd,'') != '' GROUP BY cwd ORDER BY c DESC LIMIT 40",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            for r in rows.flatten() {
                paths.push(r);
            }
        }
    }
    // 归一化：canonicalize 消除正反斜杠差异；排除临时缓存 / 不存在目录
    let mut normalized: Vec<String> = Vec::new();
    for p in paths {
        let pb = Path::new(&p);
        if p.contains("workbuddy-cache") || p.contains("\\.cache\\") || p.contains("/.cache/") {
            continue;
        }
        if !pb.is_dir() {
            continue;
        }
        let canon = std::fs::canonicalize(pb).unwrap_or_else(|_| pb.to_path_buf());
        let s = canon.to_string_lossy().to_string();
        if !normalized.contains(&s) {
            normalized.push(s);
        }
    }
    store.with(|conn| {
        for p in &normalized {
            conn.execute(
                "INSERT OR IGNORE INTO projects(path, name) VALUES (?1, ?2)",
                rusqlite::params![p, project_name(p)],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
}

fn instruction_files(path: &Path) -> Vec<(String, PathBuf)> {
    let mut out = Vec::new();
    for (name, agent) in [("AGENTS.md", "zcode"), ("CLAUDE.md", "claude")] {
        let p = path.join(name);
        if p.is_file() {
            out.push((agent.to_string(), p));
        }
    }
    out
}

fn upsert_block(content: &str) -> (String, bool) {
    // 幂等：有标记替换标记内，无标记追加
    if let (Some(s), Some(e_rel)) = (content.find(BLOCK_START), content.find(BLOCK_END)) {
        if e_rel >= s {
            let mut out = String::new();
            out.push_str(&content[..s]);
            out.push_str(BRIDGE_BLOCK);
            out.push_str(&content[e_rel + BLOCK_END.len()..]);
            return (out, true);
        }
    }
    let mut out = content.to_string();
    if !out.is_empty() && !out.ends_with('\n') {
        out.push('\n');
    }
    out.push('\n');
    out.push_str(BRIDGE_BLOCK);
    out.push('\n');
    (out, false)
}

pub fn overview_projects(store: &Store) -> Res<Vec<ProjectInfo>> {
    ensure_projects_from_agents(store)?;
    // 注册表清理：删除缓存目录 / 已不存在的路径 / canonicalize 后重复的行
    store.with(|conn| {
        let mut stmt = conn
            .prepare("SELECT id, path FROM projects")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut all: Vec<(i64, String)> = Vec::new();
        for r in rows {
            all.push(r.map_err(|e| e.to_string())?);
        }
        let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
        for (id, path) in all {
            let pb = Path::new(&path);
            let junk = path.contains("workbuddy-cache")
                || path.contains("\\.cache\\")
                || path.contains("/.cache/")
                || !pb.is_dir();
            let canon = std::fs::canonicalize(pb)
                .unwrap_or_else(|_| pb.to_path_buf())
                .to_string_lossy()
                .to_lowercase();
            let dup = !seen.insert(canon);
            if junk || dup {
                let _ = conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id]);
            }
        }
        Ok(())
    })?;
    store.with(|conn| {
        let mut stmt = conn
            .prepare("SELECT id, path FROM projects ORDER BY id DESC")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            let (id, path) = r.map_err(|e| e.to_string())?;
            let root = Path::new(&path);
            let ai = root.join(".ai");
            let ai_ready = ai.join("MEMORY.md").is_file();
            let mut bridges = Vec::new();
            for (agent, file) in instruction_files(root) {
                let content = std::fs::read_to_string(&file).unwrap_or_default();
                let injected = content.contains(BLOCK_START);
                let expected: Option<String> = conn
                    .query_row(
                        "SELECT block_hash FROM bridge_targets WHERE project_id = ?1 AND file_path = ?2",
                        rusqlite::params![id, file.to_string_lossy()],
                        |row| row.get(0),
                    )
                    .ok();
                let drifted = injected
                    && expected
                        .as_ref()
                        .map(|h| *h != fnv1a(&content))
                        .unwrap_or(false);
                bridges.push(BridgeStatus {
                    file: file.to_string_lossy().to_string(),
                    injected,
                    drifted,
                });
                let _ = agent;
            }
            // 蒸馏候选：项目 .workbuddy/memory/*.md 中未入 .ai/MEMORY.md 的行数（粗估）
            let mut candidates = 0usize;
            let wb_mem_dir = root.join(".workbuddy").join("memory");
            if let Ok(entries) = std::fs::read_dir(&wb_mem_dir) {
                let existing = std::fs::read_to_string(ai.join("MEMORY.md")).unwrap_or_default();
                let existing_lines: std::collections::HashSet<&str> =
                    existing.lines().map(str::trim).collect();
                for e in entries.flatten() {
                    if let Ok(c) = std::fs::read_to_string(e.path()) {
                        for line in c.lines() {
                            let t = line.trim();
                            if t.len() > 8 && !existing_lines.contains(t) && !t.starts_with('#') {
                                candidates += 1;
                            }
                        }
                    }
                }
            }
            out.push(ProjectInfo {
                path: path.clone(),
                name: project_name(&path),
                ai_ready,
                bridges,
                consolidate_candidates: candidates,
            });
        }
        Ok(out)
    })
}

/// init：创建 .ai/ 结构 + 幂等注入桥接块到已存在的指令文件
pub fn init_project_bridge(store: &Store, path: &str) -> Res<Vec<String>> {
    let root = Path::new(path);
    if !root.is_dir() {
        return Err(format!("项目目录不存在：{path}"));
    }
    let mut steps = Vec::new();
    let ai = root.join(".ai");
    for (name, content) in [
        ("PROJECT.md", "# PROJECT\n\n（技术栈 / 目录结构 / 常用命令 / 规范 —— 稳定事实写这里）\n"),
        ("MEMORY.md", "# MEMORY\n\n（关键决策与踩坑 —— 由各 agent 与蒸馏共同维护）\n"),
    ] {
        let p = ai.join(name);
        if !p.is_file() {
            std::fs::create_dir_all(&ai).map_err(|e| e.to_string())?;
            fsutil::atomic_write(&p, content.as_bytes())?;
            steps.push(format!("创建 .ai/{name}"));
        }
    }
    let mem_dir = ai.join("memory");
    if !mem_dir.is_dir() {
        std::fs::create_dir_all(&mem_dir).map_err(|e| e.to_string())?;
        steps.push("创建 .ai/memory/".into());
    }
    let today = Local_date();
    let log = mem_dir.join(format!("{today}.md"));
    if !log.is_file() {
        fsutil::atomic_write(&log, format!("# {today}\n\n").as_bytes())?;
    }

    let project_id: i64 = store.with(|conn| {
        conn.execute(
            "INSERT INTO projects(path, name) VALUES (?1, ?2)
             ON CONFLICT(path) DO UPDATE SET name = excluded.name",
            rusqlite::params![path, project_name(path)],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.query_row(
            "SELECT id FROM projects WHERE path = ?1",
            rusqlite::params![path],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?)
    })?;

    let files = instruction_files(root);
    if files.is_empty() {
        steps.push("未找到 AGENTS.md / CLAUDE.md —— 桥接块未注入（可手动创建指令文件后重新 init）".into());
    }
    for (agent, file) in files {
        let content = std::fs::read_to_string(&file).unwrap_or_default();
        let (new_content, replaced) = upsert_block(&content);
        let backup_dir = store::backups_dir().join("bridge");
        fsutil::backup_file(&file, &backup_dir).ok();
        fsutil::atomic_write(&file, new_content.as_bytes())?;
        let hash = fnv1a(&new_content);
        store.with(|conn| {
            conn.execute(
                "INSERT INTO bridge_targets(project_id, agent, file_path, block_hash, injected_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now','localtime'))
                 ON CONFLICT(project_id, file_path) DO UPDATE SET
                   agent = excluded.agent, block_hash = excluded.block_hash,
                   injected_at = excluded.injected_at",
                rusqlite::params![project_id, agent, file.to_string_lossy(), hash],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })?;
        steps.push(format!(
            "注入 {} {}",
            file.file_name().unwrap_or_default().to_string_lossy(),
            if replaced { "（替换标记块）" } else { "（追加）" }
        ));
    }
    store.with(|conn| {
        store::log_op(conn, "project.init", path, serde_json::json!({ "steps": steps }));
        Ok(())
    })?;
    Ok(steps)
}

/// sync：漂移检测并恢复标记块
pub fn sync_project_bridge(store: &Store, path: &str) -> Res<Vec<String>> {
    let root = Path::new(path);
    let mut steps = Vec::new();
    let project_id: Option<i64> = store.with(|conn| {
        Ok(conn
            .query_row(
                "SELECT id FROM projects WHERE path = ?1",
                rusqlite::params![path],
                |row| row.get(0),
            )
            .ok())
    })?;
    let Some(project_id) = project_id else {
        return Err("项目未注册，请先 init".into());
    };
    for (_, file) in instruction_files(root) {
        let content = std::fs::read_to_string(&file).unwrap_or_default();
        if !content.contains(BLOCK_START) {
            steps.push(format!("{}：无桥接块（可 init 注入）", file.file_name().unwrap_or_default().to_string_lossy()));
            continue;
        }
        let hash_now = fnv1a(&content);
        let expected: Option<String> = store.with(|conn| {
            Ok(conn
                .query_row(
                    "SELECT block_hash FROM bridge_targets WHERE project_id = ?1 AND file_path = ?2",
                    rusqlite::params![project_id, file.to_string_lossy()],
                    |row| row.get(0),
                )
                .ok())
        })?;
        if Some(hash_now.clone()) == expected {
            steps.push(format!("{}：桥接块完好", file.file_name().unwrap_or_default().to_string_lossy()));
        } else {
            let (new_content, _) = upsert_block(&content);
            fsutil::backup_file(&file, &store::backups_dir().join("bridge")).ok();
            fsutil::atomic_write(&file, new_content.as_bytes())?;
            let hash = fnv1a(&new_content);
            store.with(|conn| {
                conn.execute(
                    "UPDATE bridge_targets SET block_hash = ?3, injected_at = datetime('now','localtime')
                     WHERE project_id = ?1 AND file_path = ?2",
                    rusqlite::params![project_id, file.to_string_lossy(), hash],
                )
                .map_err(|e| e.to_string())?;
                Ok(())
            })?;
            steps.push(format!(
                "{}：检测到漂移，已恢复标记块",
                file.file_name().unwrap_or_default().to_string_lossy()
            ));
        }
    }
    store.with(|conn| {
        store::log_op(conn, "project.sync", path, serde_json::json!({ "steps": steps }));
        Ok(())
    })?;
    Ok(steps)
}

/// consolidate：读取项目 .workbuddy/memory/*.md（各 agent 自动沉淀）→ 行级去重 → 蒸馏进 .ai/MEMORY.md
pub fn consolidate_project_bridge(store: &Store, path: &str) -> Res<Vec<String>> {
    let root = Path::new(path);
    let ai = root.join(".ai");
    let memory_md = ai.join("MEMORY.md");
    if !memory_md.is_file() {
        return Err("项目尚未 init（.ai/MEMORY.md 不存在）".into());
    }
    let existing = std::fs::read_to_string(&memory_md).unwrap_or_default();
    let mut existing_lines: std::collections::HashSet<String> =
        existing.lines().map(|l| l.trim().to_string()).collect();
    let mut added: Vec<String> = Vec::new();
    let wb_mem_dir = root.join(".workbuddy").join("memory");
    if let Ok(entries) = std::fs::read_dir(&wb_mem_dir) {
        let mut files: Vec<PathBuf> = entries.flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "md").unwrap_or(false)).collect();
        files.sort();
        for f in files {
            let Ok(content) = std::fs::read_to_string(&f) else { continue };
            let day = f
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let mut section: Vec<String> = Vec::new();
            for line in content.lines() {
                let t = line.trim();
                if t.len() > 8 && !t.starts_with('#') && !existing_lines.contains(t) {
                    // 源行已是 bullet 则不加前缀，避免 "- - "
                    section.push(if t.starts_with("- ") {
                        t.to_string()
                    } else {
                        format!("- {t}")
                    });
                    existing_lines.insert(t.to_string());
                }
            }
            if !section.is_empty() {
                added.push(format!(
                    "\n## 蒸馏 · {day} · 来源: workbuddy\n{}\n",
                    section.join("\n")
                ));
            }
        }
    }
    let mut steps = Vec::new();
    if added.is_empty() {
        steps.push("没有新的蒸馏候选（已全部入 .ai/MEMORY.md）".into());
    } else {
        let mut out = existing;
        if !out.ends_with('\n') {
            out.push('\n');
        }
        for a in &added {
            out.push_str(a);
        }
        fsutil::backup_file(&memory_md, &store::backups_dir().join("memory")).ok();
        fsutil::atomic_write(&memory_md, out.as_bytes())?;
        steps.push(format!("已蒸馏 {} 个来源段 → .ai/MEMORY.md（均标注来源与日期）", added.len()));
    }
    store.with(|conn| {
        store::log_op(
            conn,
            "project.consolidate",
            path,
            serde_json::json!({ "steps": steps }),
        );
        Ok(())
    })?;
    Ok(steps)
}

fn Local_date() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

// ─── Tauri commands（M6） ───

use tauri::State;

#[tauri::command]
pub fn memory_global_list() -> Result<Vec<MemoryFile>, String> {
    Ok(global_files())
}

#[tauri::command]
pub fn memory_read(state: State<'_, Store>, path: String) -> Result<String, String> {
    read_global(&state, &path)
}

#[tauri::command]
pub fn memory_write(state: State<'_, Store>, input: WriteMemoryInput) -> Result<(), String> {
    write_global(&state, &input)
}

#[tauri::command]
pub fn projects_overview(state: State<'_, Store>) -> Result<Vec<ProjectInfo>, String> {
    overview_projects(&state)
}

#[tauri::command]
pub fn project_init(state: State<'_, Store>, path: String) -> Result<Vec<String>, String> {
    init_project_bridge(&state, &path)
}

#[tauri::command]
pub fn project_sync(state: State<'_, Store>, path: String) -> Result<Vec<String>, String> {
    sync_project_bridge(&state, &path)
}

#[tauri::command]
pub fn project_consolidate(state: State<'_, Store>, path: String) -> Result<Vec<String>, String> {
    consolidate_project_bridge(&state, &path)
}

/// 供路径校验单元测试使用
#[allow(dead_code)]
fn home_for_test() -> PathBuf {
    agent_home()
}
