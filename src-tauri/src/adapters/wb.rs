//! WorkBuddy adapter —— 路径与资产探测（方案 §2.1 实测结论）。
//! MCP：~/.workbuddy/mcp.json {mcpServers:{name:{type,command,args,url,timeout,disabled}}}
//! Skills：~/.workbuddy/skills/<name>（逐项链）
//! Memory：~/.workbuddy/memory/<uid>_memory.md + user-<uid>-personal/MEMORY.md
//! 登录态：%LOCALAPPDATA%\CodeBuddyExtension\Data\Public\auth\workbuddy-desktop.info
// mcp/memory/settings 路径为 M3/M5/M6 预留
#![allow(dead_code)]

use std::path::PathBuf;

use crate::adapters::agent_home;

pub fn dir() -> PathBuf {
    agent_home().join(".workbuddy")
}
pub fn skills_dir() -> PathBuf {
    dir().join("skills")
}
pub fn mcp_json() -> PathBuf {
    dir().join("mcp.json")
}
/// 第三方自定义模型（openai-compatible 写穿，WB 侧 1s debounce 热加载）：
/// 裸数组或 {models:[...], availableModels:[...]}，条目必须带 id
pub fn models_json() -> PathBuf {
    dir().join("models.json")
}
pub fn memory_dir() -> PathBuf {
    dir().join("memory")
}
pub fn settings_json() -> PathBuf {
    dir().join("settings.json")
}

/// 登录态文件（含加密 token，工具只做文件级复制，永不读内容 —— 方案安全红线）
pub fn auth_info() -> Option<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let p = PathBuf::from(local)
        .join("CodeBuddyExtension")
        .join("Data")
        .join("Public")
        .join("auth")
        .join("workbuddy-desktop.info");
    p.exists().then_some(p)
}

/// 已登录的账号目录 user-<uid>-personal（memory 岛按账号分组展示）
pub fn user_dirs() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir()) {
        for e in entries.flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if n.starts_with("user-") && n.ends_with("-personal") {
                out.push(n);
            }
        }
    }
    out.sort();
    out
}

/// WB 技能开关存储（storage/user-*-personal/scoped/*/skills-installed-store.json，
/// 面板「允许模型自动调用」开关落在这些文件的 disableModelInvocation 字段）
pub fn skill_toggle_stores() -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(accounts) = std::fs::read_dir(dir().join("storage")) else {
        return out;
    };
    for acct in accounts.flatten() {
        let name = acct.file_name().to_string_lossy().to_string();
        if !(name.starts_with("user-") && name.ends_with("-personal")) {
            continue;
        }
        let Ok(scopes) = std::fs::read_dir(acct.path().join("scoped")) else {
            continue;
        };
        for scope in scopes.flatten() {
            let p = scope.path().join("skills-installed-store.json");
            if p.is_file() {
                out.push(p);
            }
        }
    }
    out
}

/// 安装探测：目录存在即视为已安装
pub fn installed() -> bool {
    dir().is_dir()
}
