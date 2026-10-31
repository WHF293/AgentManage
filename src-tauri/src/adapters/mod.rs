//! adapters —— AgentAdapter 抽象（方案 §4 核心层）。
//! 每个 agent 一个模块：路径约定、资产探测、格式翻译。
//! claude / codex / trae 只预留接口位，不再实现（方案 §8.6）。

pub mod wb;
pub mod zcode;

use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::fsutil;

/// Windows 下取用户主目录（本项目 Windows 优先，不走 home 环境变量链）
pub fn agent_home() -> PathBuf {
    PathBuf::from(
        std::env::var("USERPROFILE").unwrap_or_else(|_| r"C:\Users\Public".to_string()),
    )
}

/// skill 目录扫描结果（中央仓库与各 agent 目录共用）
#[derive(Debug, Serialize, Clone)]
pub struct SkillDirInfo {
    pub name: String,
    pub path: String,
    /// 是软链（symlink/junction）还是实目录
    pub is_link: bool,
    /// 软链目标（归一化，去掉 \\?\ 前缀）
    pub link_target: Option<String>,
    pub description: Option<String>,
    /// 目录 mtime（epoch ms）
    pub mtime_ms: i64,
    /// 是否可导入：实目录且含 SKILL.md
    pub importable: bool,
}

/// 扫描一个 skills 目录（仅目录项；不存在返回空）
pub fn scan_skills_dir(dir: &std::path::Path) -> Vec<SkillDirInfo> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let linked = fsutil::is_link(&path);
        let link_target = fsutil::link_target(&path).map(|p| p.to_string_lossy().to_string());
        // 软链指向的目标是否为目录（断链 = 链接存在但目标不可达）
        let target_ok = link_target
            .as_ref()
            .map(|t| std::path::Path::new(t).is_dir())
            .unwrap_or(!linked);
        let skill_md = path.join("SKILL.md");
        let (fm_name, description) = if skill_md.is_file() {
            fsutil::parse_skill_md(&skill_md)
        } else {
            (None, None)
        };
        let mtime_ms = entry
            .metadata()
            .ok()
            .and_then(|md| md.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        out.push(SkillDirInfo {
            name: fm_name.unwrap_or(name),
            path: path.to_string_lossy().to_string(),
            is_link: linked,
            link_target,
            description,
            mtime_ms,
            // importable：实目录（软链不导入，避免把别人的目标拷进来）；断链不可导入
            importable: !linked && target_ok && skill_md.is_file(),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}
