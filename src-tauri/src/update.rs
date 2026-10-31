//! update —— 在线更新：检测 GitHub Release 最新版（私有仓库走 gh CLI，公开回退 API），
//! 下载新 exe 到 ~/.agenthub/updates/，经 bat「等退出 → 替换 → 重启」完成自更新。
//! AgentHub 是单文件 exe（--no-bundle），无 NSIS 安装器，替换自身必须借道 bat。

use std::io::{Read, Write};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;
use tauri::Emitter;

use crate::fsutil::{self, Res};
use crate::store;

const REPO: &str = "WHF293/AgentManage";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const USER_AGENT: &str = "AgentHub";

#[derive(Debug, Serialize, Clone)]
pub struct UpdateCheckInfo {
    pub current: String,
    pub latest: String,
    pub has_update: bool,
    /// Release tag（gh 下载通道用）
    pub tag: String,
    pub asset_name: String,
    pub asset_url: String,
    pub release_url: String,
}

struct ReleaseAsset {
    tag: String,
    name: String,
    url: String,
}

fn http_client() -> Res<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP 客户端构建失败: {e}"))
}

/// 资产名匹配：AgentHub_v*_x64.exe
fn pick_asset_name(name: &str) -> bool {
    name.starts_with("AgentHub_v") && name.ends_with("_x64.exe")
}

/// 通道 1：gh CLI（私有仓库可用；未安装/未登录则失败跳过）
fn fetch_via_gh() -> Res<ReleaseAsset> {
    let out = Command::new("gh")
        .args(["api", &format!("repos/{REPO}/releases/latest")])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("gh 不可用: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "gh 查询失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    parse_release_json(&String::from_utf8_lossy(&out.stdout))
}

/// 通道 2：公开 Releases API
fn fetch_via_api(http: &reqwest::blocking::Client) -> Res<ReleaseAsset> {
    let body = http
        .get(&format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .map_err(|e| format!("GitHub API 请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("GitHub API 返回异常: {e}（私有仓库需本机 gh 登录）"))?
        .text()
        .map_err(|e| format!("GitHub API 读取失败: {e}"))?;
    parse_release_json(&body)
}

fn parse_release_json(body: &str) -> Res<ReleaseAsset> {
    let v: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Release JSON 解析失败: {e}"))?;
    let tag = v
        .get("tag_name")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let assets = v.get("assets").and_then(|x| x.as_array());
    let Some(assets) = assets else {
        return Err("Release 无 assets".into());
    };
    for a in assets {
        let name = a.get("name").and_then(|x| x.as_str()).unwrap_or("");
        if pick_asset_name(name) {
            let url = a
                .get("browser_download_url")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            if !url.is_empty() {
                return Ok(ReleaseAsset { tag, name: name.to_string(), url });
            }
        }
    }
    Err("最新 Release 未包含 AgentHub_v*_x64.exe 资产".into())
}

/// 版本比较：a < b → true（逐段数值比较，忽略 v 前缀）
fn version_lt(a: &str, b: &str) -> bool {
    let parse = |s: &str| -> Vec<i64> {
        s.trim_start_matches('v')
            .split('.')
            .map(|p| p.parse::<i64>().unwrap_or(0))
            .collect()
    };
    let (va, vb) = (parse(a), parse(b));
    for i in 0..3 {
        let x = va.get(i).copied().unwrap_or(0);
        let y = vb.get(i).copied().unwrap_or(0);
        if x != y {
            return x < y;
        }
    }
    false
}

fn check_blocking(current: &str) -> Res<UpdateCheckInfo> {
    let asset = match fetch_via_gh() {
        Ok(a) => a,
        Err(gh_err) => {
            let http = http_client()?;
            fetch_via_api(&http).map_err(|api_err| {
                format!("检测失败（gh: {gh_err}；api: {api_err}）")
            })?
        }
    };
    let latest = asset.tag.trim_start_matches('v').to_string();
    let has_update = version_lt(current, &latest);
    Ok(UpdateCheckInfo {
        current: current.to_string(),
        tag: asset.tag,
        latest,
        has_update,
        asset_name: asset.name,
        asset_url: asset.url,
        release_url: format!("https://github.com/{REPO}/releases/latest"),
    })
}

fn updates_dir() -> PathBuf {
    store::hub_dir().join("updates")
}

fn download_blocking(app: &tauri::AppHandle, url: &str, dest: &PathBuf) -> Res<()> {
    let http = http_client()?;
    let mut resp = http
        .get(url)
        .send()
        .map_err(|e| format!("下载请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("下载返回异常: {e}"))?;
    let total = resp.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(dest).map_err(|e| format!("写盘失败: {e}"))?;
    let mut buf = [0u8; 65536];
    let mut received: u64 = 0;
    let mut last_emit = std::time::Instant::now();
    loop {
        let n = resp.read(&mut buf).map_err(|e| format!("下载中断: {e}"))?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| format!("写盘失败: {e}"))?;
        received += n as u64;
        if last_emit.elapsed().as_millis() > 200 {
            last_emit = std::time::Instant::now();
            let _ = app.emit(
                "update-download-progress",
                serde_json::json!({ "received": received, "total": total }),
            );
        }
    }
    file.flush().ok();
    let _ = app.emit(
        "update-download-progress",
        serde_json::json!({ "received": received, "total": received }),
    );
    if received == 0 {
        return Err("下载内容为空".into());
    }
    Ok(())
}

/// 通道 1：gh release download（私有仓库带凭据；无进度回调，原子产出）
fn download_via_gh(tag: &str, pattern: &str, dest: &Path) -> Res<()> {
    let out = Command::new("gh")
        .args([
            "release",
            "download",
            tag,
            "--repo",
            REPO,
            "--pattern",
            pattern,
            "--clobber",
            "--output",
        ])
        .arg(dest)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("gh 不可用: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "gh 下载失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    if !dest.is_file() {
        return Err("gh 下载未产出文件".into());
    }
    Ok(())
}

fn install_blocking(app: &tauri::AppHandle, tag: &str, asset_name: &str, url: &str) -> Res<()> {
    let dir = updates_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let new_exe = dir.join("AgentHub_update.exe");
    let _ = std::fs::remove_file(&new_exe);

    // 私有仓库的 browser_download_url 匿名访问 404 —— 首选 gh（带凭据），公开仓库回退 reqwest
    match download_via_gh(tag, asset_name, &new_exe) {
        Ok(()) => {
            let _ = app.emit(
                "update-download-progress",
                serde_json::json!({ "received": 1, "total": 1 }),
            );
        }
        Err(gh_err) => {
            download_blocking(app, url, &new_exe).map_err(|dl_err| {
                format!("下载失败（gh: {gh_err}；直连: {dl_err}）")
            })?;
        }
    }

    let current = std::env::current_exe().map_err(|e| format!("取当前 exe 路径失败: {e}"))?;
    let current_str = current.to_string_lossy().replace('/', "\\");
    let new_str = new_exe.to_string_lossy().replace('/', "\\");
    let bat = dir.join("apply-update.bat");
    let script = format!(
        "@echo off\r\n timeout /t 2 /nobreak >nul\r\ncopy /y \"{new_str}\" \"{current_str}\"\r\nif errorlevel 1 exit /b 1\r\ndel \"{new_str}\"\r\nstart \"\" \"{current_str}\"\r\n",
    );
    fsutil::atomic_write(&bat, script.as_bytes())?;

    Command::new("cmd")
        .args(["/C", &bat.to_string_lossy()])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("启动更新脚本失败: {e}"))?;
    // bat 自己等 2s 后替换并重启，这里直接退出当前应用
    app.exit(0);
    Ok(())
}

// ─── Tauri commands ───

/// 检查更新（gh CLI 优先适配私有仓库，公开 API 兜底）
#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> Result<UpdateCheckInfo, String> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || check_blocking(&current))
        .await
        .map_err(|e| format!("检测任务失败: {e}"))?
}

/// 更新安装参数（多单词参数收进 input 结构体，规避 IPC 大小写约定）
#[derive(Debug, serde::Deserialize)]
pub struct InstallInput {
    pub tag: String,
    pub asset_name: String,
    pub asset_url: String,
}

/// 下载最新 exe 并替换自身后重启（进度经 update-download-progress 事件推送）
#[tauri::command]
pub async fn update_install(app: tauri::AppHandle, input: InstallInput) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        install_blocking(&app, &input.tag, &input.asset_name, &input.asset_url)
    })
    .await
    .map_err(|e| format!("更新任务失败: {e}"))?
}
