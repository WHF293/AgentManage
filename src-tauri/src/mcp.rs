//! mcp —— M3 统一 MCP 引擎：单一事实源（SQLite）→ 双格式翻译写入。
//!
//! 格式（方案 §2.1 / §2.2 实测）：
//! - WB   `~/.workbuddy/mcp.json`      `{mcpServers:{name:{type,command,args,url,timeout,disabled}}}`
//! - ZCode `~/.zcode/cli/config.json`  `{plugins…, mcp:{servers:{name:{type,command,args,enabled?}}}}`
//!
//! 纪律：写前备份 → 保留目标文件未知键 → 原子写 → serde_json 序列化保证合法。

use std::collections::BTreeMap;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;

use crate::adapters::{wb, zcode};
use crate::fsutil::{self, Res};
use crate::store::{self, Store};

/// 两端均不支持、不写入的类型预留位。
/// 实测定版（2026-10-31）：远程 MCP 两端都支持 —— WB 叫 streamableHttp，ZCode 叫 http，翻译层转换。
pub const WB_ONLY_TYPES: [&str; 0] = [];

// ─── 统一模型 ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServer {
    pub name: String,
    /// stdio | streamableHttp
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled_wb: bool,
    #[serde(default = "default_true")]
    pub enabled_zcode: bool,
}

fn default_true() -> bool {
    true
}

// ─── DB 存取 ───

fn row_to_server(row: &rusqlite::Row) -> rusqlite::Result<McpServer> {
    Ok(McpServer {
        name: row.get(0)?,
        kind: row
            .get::<_, Option<String>>(1)?
            .unwrap_or_else(|| "stdio".into()),
        command: row.get(2)?,
        args: row
            .get::<_, Option<String>>(3)?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
        url: row.get(4)?,
        env: row
            .get::<_, Option<String>>(5)?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
        enabled_wb: row.get::<_, i64>(6)? != 0,
        enabled_zcode: row.get::<_, i64>(7)? != 0,
        headers: row
            .get::<_, Option<String>>(8)?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
    })
}

pub fn list_servers(conn: &Connection) -> Res<Vec<McpServer>> {
    let mut stmt = conn
        .prepare(
            "SELECT name, type, command, args_json, url, env_json, enabled_wb, enabled_zcode, headers_json
             FROM mcp_servers ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], row_to_server)
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn upsert_server(conn: &Connection, s: &McpServer) -> Res<()> {
    conn.execute(
        "INSERT INTO mcp_servers(name, type, command, args_json, url, env_json, enabled_wb, enabled_zcode, headers_json, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9, datetime('now','localtime'))
         ON CONFLICT(name) DO UPDATE SET
           type=excluded.type, command=excluded.command, args_json=excluded.args_json,
           url=excluded.url, env_json=excluded.env_json, headers_json=excluded.headers_json,
           enabled_wb=excluded.enabled_wb, enabled_zcode=excluded.enabled_zcode,
           updated_at=excluded.updated_at",
        rusqlite::params![
            s.name,
            s.kind,
            s.command,
            serde_json::to_string(&s.args).map_err(|e| e.to_string())?,
            s.url,
            serde_json::to_string(&s.env).map_err(|e| e.to_string())?,
            s.enabled_wb as i64,
            s.enabled_zcode as i64,
            serde_json::to_string(&s.headers).map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_server(conn: &Connection, name: &str) -> Res<()> {
    conn.execute("DELETE FROM mcp_servers WHERE name = ?1", rusqlite::params![name])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─── 目标文件读写（保留未知键） ───

fn read_json(path: &std::path::Path) -> Res<Value> {
    match fsutil::read_opt(path) {
        Some(bytes) => serde_json::from_slice(&bytes)
            .map_err(|e| format!("JSON 解析失败 {}: {e}", path.display())),
        None => Ok(json!({})),
    }
}

fn servers_map_of(value: &Value, container: &[&str]) -> Map<String, Value> {
    let mut cur = value;
    for key in container {
        cur = cur.get(key).unwrap_or(&Value::Null);
    }
    cur.as_object().cloned().unwrap_or_default()
}

/// WB mcpServers 里每个 server 的当前状态：present / disabled / missing
fn wb_entry_status(entry: &Value) -> &'static str {
    if entry.get("disabled").and_then(Value::as_bool) == Some(true) {
        "disabled"
    } else {
        "present"
    }
}

/// ZCode mcp.servers 里每个 server 的当前状态：present / disabled / missing
fn zc_entry_status(entry: &Value) -> &'static str {
    match entry.get("enabled") {
        Some(Value::Bool(false)) => "disabled",
        _ => "present",
    }
}

#[derive(Debug, Serialize)]
pub struct McpOverviewItem {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub command: Option<String>,
    pub url: Option<String>,
    pub enabled_wb: bool,
    pub enabled_zcode: bool,
    /// 与目标文件实测：ok / disabled / missing / drifted（同名字段不一致）
    pub wb_status: String,
    pub zcode_status: String,
    /// ZCode 不支持 HTTP 型 → 仅 WB
    pub zcode_unsupported: bool,
}

#[derive(Debug, Serialize, Default)]
pub struct McpDrift {
    /// 只存在于目标文件、未纳入统一定义的名字
    pub wb_only: Vec<String>,
    pub zcode_only: Vec<String>,
}

/// 总览：DB 定义 × 双端实测
pub fn overview(store: &Store) -> Res<(Vec<McpOverviewItem>, McpDrift)> {
    let (servers, wb_map, zc_map) = store.with(|conn| {
        let servers = list_servers(conn)?;
        let wb_map = servers_map_of(&read_json(&wb::mcp_json())?, &["mcpServers"]);
        let zc_map = servers_map_of(&read_json(&zcode::cli_config())?, &["mcp", "servers"]);
        Ok((servers, wb_map, zc_map))
    })?;

    let mut items = Vec::new();
    for s in &servers {
        let wb_live = wb_map.get(&s.name).map(wb_entry_status);
        let zc_live = zc_map.get(&s.name).map(zc_entry_status);
        let wb_status = match wb_live {
            None => "missing",
            Some("present") if s.enabled_wb => "ok",
            Some("disabled") if !s.enabled_wb => "ok",
            _ => "drifted",
        };
        let unsupported = WB_ONLY_TYPES.contains(&s.kind.as_str());
        let zcode_status = if unsupported {
            "unsupported"
        } else {
            match zc_live {
                None => "missing",
                Some("present") if s.enabled_zcode => "ok",
                Some("disabled") if !s.enabled_zcode => "ok",
                _ => "drifted",
            }
        };
        items.push(McpOverviewItem {
            name: s.name.clone(),
            kind: s.kind.clone(),
            command: s.command.clone(),
            url: s.url.clone(),
            enabled_wb: s.enabled_wb,
            enabled_zcode: s.enabled_zcode,
            wb_status: wb_status.into(),
            zcode_status: zcode_status.into(),
            zcode_unsupported: unsupported,
        });
    }
    let drift = McpDrift {
        wb_only: wb_map
            .keys()
            .filter(|n| !servers.iter().any(|s| &s.name == *n))
            .cloned()
            .collect(),
        zcode_only: zc_map
            .keys()
            .filter(|n| !servers.iter().any(|s| &s.name == *n))
            .cloned()
            .collect(),
    };
    Ok((items, drift))
}

/// 收编：把目标文件里已有的 server 并入统一定义（首次接管 / 漂移回填）
/// 冲突时以 WB 侧字段为准（WB 支持的格式更全）。
pub fn adopt_from_targets(store: &Store, overwrite: bool) -> Res<usize> {
    let wb_map = servers_map_of(&read_json(&wb::mcp_json())?, &["mcpServers"]);
    let zc_map = servers_map_of(&read_json(&zcode::cli_config())?, &["mcp", "servers"]);
    let mut names: Vec<String> = wb_map.keys().cloned().collect();
    names.extend(zc_map.keys().cloned());
    names.sort();
    names.dedup();

    let mut count = 0;
    store.with(|conn| {
        for name in names {
            let existing = conn
                .query_row(
                    "SELECT COUNT(*) FROM mcp_servers WHERE name = ?1",
                    rusqlite::params![name],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(|e| e.to_string())?;
            if existing > 0 && !overwrite {
                continue;
            }
            let wb_entry = wb_map.get(&name);
            let zc_entry = zc_map.get(&name);
            let kind = wb_entry
                .and_then(|e| e.get("type").and_then(Value::as_str))
                .or_else(|| zc_entry.and_then(|e| e.get("type").and_then(Value::as_str)))
                .unwrap_or("stdio")
                .to_string();
            // 远程 MCP 统一以 WB 命名为规范型（写入 ZCode 时翻译回 http）
            let kind = if kind == "http" {
                "streamableHttp".to_string()
            } else {
                kind
            };
            let command = wb_entry
                .and_then(|e| e.get("command").and_then(Value::as_str))
                .or_else(|| zc_entry.and_then(|e| e.get("command").and_then(Value::as_str)))
                .map(String::from);
            let args = wb_entry
                .and_then(|e| e.get("args").cloned())
                .or_else(|| zc_entry.and_then(|e| e.get("args").cloned()))
                .and_then(|v| serde_json::from_value::<Vec<String>>(v).ok())
                .unwrap_or_default();
            let url = wb_entry
                .and_then(|e| e.get("url").and_then(Value::as_str))
                .or_else(|| zc_entry.and_then(|e| e.get("url").and_then(Value::as_str)))
                .map(String::from);
            let env: BTreeMap<String, String> = wb_entry
                .and_then(|e| e.get("env").cloned())
                .or_else(|| zc_entry.and_then(|e| e.get("env").cloned()))
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            let headers: BTreeMap<String, String> = wb_entry
                .and_then(|e| e.get("headers").cloned())
                .or_else(|| zc_entry.and_then(|e| e.get("headers").cloned()))
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_default();
            let enabled_wb = match wb_entry.map(wb_entry_status) {
                Some("disabled") => false,
                Some(_) => true,
                None => false,
            };
            let enabled_zcode = match zc_entry.map(zc_entry_status) {
                Some("disabled") => false,
                Some(_) => true,
                None => false,
            };
            upsert_server(
                conn,
                &McpServer {
                    name: name.clone(),
                    kind,
                    command,
                    args,
                    url,
                    env,
                    headers,
                    enabled_wb,
                    enabled_zcode,
                },
            )?;
            count += 1;
        }
        store::log_op(
            conn,
            "mcp.adopt",
            "mcp_servers",
            json!({ "adopted": count, "overwrite": overwrite }),
        );
        Ok(())
    })?;
    Ok(count)
}

/// 生成 WB mcpServers 子对象：托管字段以统一定义覆盖，非托管字段（timeout 等）保留。
/// 类型翻译：规范型 streamableHttp 原样写 WB。
fn to_wb_entry(s: &McpServer, existing: Option<&Value>) -> Value {
    let mut entry = existing
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    entry.insert("type".into(), json!(s.kind));
    if let Some(cmd) = &s.command {
        entry.insert("command".into(), json!(cmd));
    } else {
        entry.remove("command");
    }
    if !s.args.is_empty() {
        entry.insert("args".into(), json!(s.args));
    } else {
        entry.remove("args");
    }
    if let Some(url) = &s.url {
        entry.insert("url".into(), json!(url));
    } else {
        entry.remove("url");
    }
    if !s.env.is_empty() {
        entry.insert("env".into(), json!(s.env));
    } else {
        entry.remove("env");
    }
    if !s.headers.is_empty() {
        entry.insert("headers".into(), json!(s.headers));
    } else {
        entry.remove("headers");
    }
    entry.insert("disabled".into(), json!(!s.enabled_wb));
    Value::Object(entry)
}

/// 生成 ZCode mcp.servers 子对象。类型翻译：streamableHttp → http（ZCode 命名）
fn to_zc_entry(s: &McpServer, existing: Option<&Value>) -> Option<Value> {
    if WB_ONLY_TYPES.contains(&s.kind.as_str()) {
        return None;
    }
    let zc_type = if s.kind == "streamableHttp" {
        "http"
    } else {
        s.kind.as_str()
    };
    let mut entry = existing
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    entry.insert("type".into(), json!(zc_type));
    if let Some(cmd) = &s.command {
        entry.insert("command".into(), json!(cmd));
    } else {
        entry.remove("command");
    }
    if !s.args.is_empty() {
        entry.insert("args".into(), json!(s.args));
    } else {
        entry.remove("args");
    }
    if let Some(url) = &s.url {
        entry.insert("url".into(), json!(url));
    } else {
        entry.remove("url");
    }
    if !s.env.is_empty() {
        entry.insert("env".into(), json!(s.env));
    } else {
        entry.remove("env");
    }
    if !s.headers.is_empty() {
        entry.insert("headers".into(), json!(s.headers));
    } else {
        entry.remove("headers");
    }
    entry.insert("enabled".into(), json!(s.enabled_zcode));
    Some(Value::Object(entry))
}

fn write_json_preserving(path: &std::path::Path, backups: &std::path::Path, container: &[&str], servers: &Map<String, Value>) -> Res<()> {
    let mut root = read_json(path)?;
    if path.exists() {
        fsutil::backup_file(path, backups)?;
    }
    // 定位/创建容器对象
    let mut cur = &mut root;
    for key in container {
        if !cur.is_object() {
            *cur = json!({});
        }
        if cur.get(key).is_none() {
            cur.as_object_mut().unwrap().insert(key.to_string(), json!({}));
        }
        cur = cur.get_mut(key).unwrap();
    }
    *cur = Value::Object(servers.clone());
    let bytes = serde_json::to_vec_pretty(&root).map_err(|e| e.to_string())?;
    fsutil::atomic_write(path, &bytes)
}

/// 全量同步：DB → 双端目标文件。
/// 写入语义：某端「启用」或「该端原本已有此条目」才写（disabled/enabled 反映状态）；
/// 单端独有的 server 不以禁用态铺到另一端（保持「未添加」）。
pub fn sync_all(store: &Store) -> Res<(String, String)> {
    let servers = store.with(list_servers)?;
    let backups = store::backups_dir();

    let wb_existing = servers_map_of(&read_json(&wb::mcp_json())?, &["mcpServers"]);
    let zc_existing = servers_map_of(&read_json(&zcode::cli_config())?, &["mcp", "servers"]);

    let mut wb_map = Map::new();
    for s in &servers {
        if s.enabled_wb || wb_existing.contains_key(&s.name) {
            wb_map.insert(s.name.clone(), to_wb_entry(s, wb_existing.get(&s.name)));
        }
    }
    let mut zc_map = Map::new();
    for s in &servers {
        if s.enabled_zcode || zc_existing.contains_key(&s.name) {
            if let Some(entry) = to_zc_entry(s, zc_existing.get(&s.name)) {
                zc_map.insert(s.name.clone(), entry);
            }
        }
    }

    write_json_preserving(&wb::mcp_json(), &backups, &["mcpServers"], &wb_map)?;
    write_json_preserving(&zcode::cli_config(), &backups, &["mcp", "servers"], &zc_map)?;

    store.with(|conn| {
        store::log_op(
            conn,
            "mcp.sync_all",
            "wb mcp.json + zcode cli/config.json",
            json!({ "servers": servers.len(), "wb_written": wb_map.len(), "zcode_written": zc_map.len() }),
        );
        Ok(())
    })?;
    Ok((
        format!("{} servers → WB", wb_map.len()),
        format!("{} servers → ZCode", zc_map.len()),
    ))
}

/// 删除 server 并同步
pub fn remove_and_sync(store: &Store, name: &str) -> Res<()> {
    store.with(|conn| {
        delete_server(conn, name)?;
        store::log_op(conn, "mcp.delete", name, json!({}));
        Ok(())
    })?;
    sync_all(store)?;
    Ok(())
}

// ─── Tauri commands（M3） ───

#[derive(Serialize)]
pub struct McpOverviewPayload {
    pub items: Vec<McpOverviewItem>,
    pub drift: McpDrift,
}

#[tauri::command]
pub fn mcp_overview(state: State<'_, Store>) -> Result<McpOverviewPayload, String> {
    let (items, drift) = overview(&state)?;
    Ok(McpOverviewPayload { items, drift })
}

/// 收编目标文件现有 server 进统一定义（首次接管 / 漂移回填）
#[tauri::command]
pub fn mcp_adopt(state: State<'_, Store>, overwrite: bool) -> Result<usize, String> {
    adopt_from_targets(&state, overwrite)
}

#[tauri::command]
pub fn mcp_save(state: State<'_, Store>, server: McpServer) -> Result<(), String> {
    state.with(|conn| {
        upsert_server(conn, &server)?;
        store::log_op(
            conn,
            "mcp.save",
            &server.name,
            json!({ "kind": server.kind, "wb": server.enabled_wb, "zcode": server.enabled_zcode }),
        );
        Ok(())
    })?;
    sync_all(&state)?;
    Ok(())
}

#[tauri::command]
pub fn mcp_toggle(
    state: State<'_, Store>,
    name: String,
    agent: String,
    enabled: bool,
) -> Result<(), String> {
    state.with(|conn| {
        let sql = match agent.as_str() {
            "workbuddy" => "UPDATE mcp_servers SET enabled_wb = ?2, updated_at = datetime('now','localtime') WHERE name = ?1",
            "zcode" => "UPDATE mcp_servers SET enabled_zcode = ?2, updated_at = datetime('now','localtime') WHERE name = ?1",
            other => return Err(format!("未知 agent：{other}")),
        };
        conn.execute(sql, rusqlite::params![name, enabled as i64])
            .map_err(|e| e.to_string())?;
        store::log_op(conn, "mcp.toggle", &name, json!({ "agent": agent, "enabled": enabled }));
        Ok(())
    })?;
    sync_all(&state)?;
    Ok(())
}

#[tauri::command]
pub fn mcp_delete(state: State<'_, Store>, name: String) -> Result<(), String> {
    remove_and_sync(&state, &name)
}

/// 校验目标文件：重算双端 diff（含漂移）
#[tauri::command]
pub fn mcp_validate(state: State<'_, Store>) -> Result<McpOverviewPayload, String> {
    let (items, drift) = overview(&state)?;
    state.with(|conn| {
        store::log_op(
            conn,
            "mcp.validate",
            "targets",
            json!({
                "drifted_wb": items.iter().filter(|i| i.wb_status == "drifted").count(),
                "drifted_zcode": items.iter().filter(|i| i.zcode_status == "drifted").count(),
                "wb_only": drift.wb_only.len(),
                "zcode_only": drift.zcode_only.len(),
            }),
        );
        Ok(())
    })?;
    Ok(McpOverviewPayload { items, drift })
}
