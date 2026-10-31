//! ZCode adapter —— 路径与资产探测（方案 §2.2 实测结论）。
//! MCP：~/.zcode/cli/config.json {plugins, mcp:{servers:{name:{type,command,args,enabled?}}}}
//! Skills：~/.zcode/skills（整目录软链，目标由 AgentHub 重建为 ~/.agenthub/skills）
//! 第三方模型：~/.zcode/v2/config.json provider.<id>:{name,kind,options,models}
//! Memory：~/.zcode/AGENTS.md + 各 workspace
// cli/v2 配置路径为 M3/M4/M9 预留
#![allow(dead_code)]

use std::path::PathBuf;

use crate::adapters::agent_home;

pub fn dir() -> PathBuf {
    agent_home().join(".zcode")
}
pub fn skills_dir() -> PathBuf {
    dir().join("skills")
}
pub fn cli_config() -> PathBuf {
    dir().join("cli").join("config.json")
}
pub fn v2_config() -> PathBuf {
    dir().join("v2").join("config.json")
}
pub fn v2_setting() -> PathBuf {
    dir().join("v2").join("setting.json")
}
pub fn rollout_dir() -> PathBuf {
    dir().join("cli").join("rollout")
}
pub fn agents_md() -> PathBuf {
    dir().join("AGENTS.md")
}

pub fn installed() -> bool {
    dir().is_dir()
}
