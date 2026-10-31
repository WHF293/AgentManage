# AGENTS.md — AI 编码代理项目说明

面向 AI 编码代理（ZCode / WorkBuddy 等）的项目指南。修改代码前请先读完本文。

## 项目概述

**AgentHub** — AI Agent 统一管理工具（Tauri 2 Windows 桌面应用）：面向 WorkBuddy 与 ZCode 双 Agent 的 Skills / MCP / 第三方模型 / WB 多账号 / Memory / 用量分析一站式管理台，替代已卸载的 cc-switch。

- 技术栈：**Tauri v2 + React 19 + TypeScript + Zustand + UnoCSS + SQLite（rusqlite bundled）+ pnpm**
- 中央存储：`~/.agenthub/`（agenthub.db 单一事实源 + skills/ 中央仓库 + backups/ 时间戳备份 + market-cache/）
- UI：Islands 布局 + 侧栏 7 岛（Usage / Skills / MCP / Models / Account / Memory / Setting）+ 明暗双主题（CSS variables）
- 里程碑：M0-M9 全部落地；数据侧已对齐双 Agent 官方口径（ZCode 累计 19 亿 / WB 请求级 24.5 亿）

## AI 记忆统一存放（硬性）

本项目记忆统一走 `.ai/`：主题层（`开发方案/`）+ 日志层（`memory/YYYY-MM-DD.md` 按日追加）。
`.ai/` 与 `local_docs/` 已 gitignore，仅本地保存。各 agent 会话结束时把做了什么/为什么追加进
`.ai/memory/<当日>.md`（这是 AgentHub 自身桥接机制的第一个样板项目）。

<!-- agent-hub:start -->
本项目所有 AI agent 共享记忆位于 `.ai/`：
- 开始任务前，先读 `.ai/MEMORY.md` 和最近几天的 `.ai/memory/` 日志
- 完成实质工作后，把做了什么/为什么追加到 `.ai/memory/YYYY-MM-DD.md`
- 稳定的项目约定写入 `.ai/PROJECT.md`
<!-- agent-hub:end -->

## 常用命令

```bash
pnpm install          # 安装依赖
pnpm tauri:dev        # Tauri 桌面开发（Rust + 前端热更）
pnpm dev              # 仅前端（浏览器预览，默认按桌面外壳渲染，?desktopTitlebar=0 关闭模拟）
pnpm build            # tsc --noEmit + vite build（提交前必须通过）
pnpm build:exe        # 打包：tauri build --no-bundle —— 只出 Windows amd64 exe（项目定版，勿改）
```

无头验收命令（不启 GUI）：

```bash
agenthub.exe --migrate [--link-mode symlink|junction|copy]   # M1 skills 迁移
agenthub.exe --sync-mcp [--adopt]                            # MCP 收编 + 双端同步
agenthub.exe --fetch-models <provider-id>                    # /v1/models 候选链
agenthub.exe --wb-status / --wb-save-slot <label>            # 账号岛探测/存槽位
agenthub.exe --usage-collect [range]                         # 用量双源采集 + 聚合
agenthub.exe --market-refresh                                # Skill 市场目录刷新
agenthub.exe --bridge-test <项目路径>                        # Memory 桥接 init/sync/consolidate
```

## 目录结构

```
src/                    前端
  api.ts                invoke 封装（TS 类型与 Rust serde 一一对应，字段保持 snake_case）
  common/               useDesktopChrome / TitleBar（自绘外壳）/ ConfirmDialog / LogoMark
  pages/                7 个功能岛（Usage 岛 = 原总览+用量合并）
  stores/               nav / theme / ui(toast)
  styles/theme.css      主题 token（侧栏/列表/卡片=中性灰，按钮与底色=清新绿，用户定版）
src-tauri/src/
  store.rs              SQLite 单一事实源 + schema 迁移（v1.x 增量 ALTER）
  adapters/             wb.rs / zcode.rs —— 各 Agent 路径约定与资产扫描
  fsutil.rs             软链三级策略（symlink→junction→copy）/ 原子写 / 备份 / fnv1a
  migrate.rs            M1：双端 skills 并集导入中央仓库 → WB 逐项链 → ZCode 整目录链
  mcp.rs                统一 MCP 表 ↔ 双格式翻译（合并式写入：托管字段覆盖，timeout 等保留）
  providers.rs          ZCode v2/config.json 直写（Key 只存目标文件不入库）
  modelfetch.rs         /v1/models 候选链（/v{N} 先拼原样 → /v1/models → 后缀剥离 → 内置推荐兜底）
  market.rs             Skill 市场（anthropics/skills + obra/superpowers + cexll/myclaude，通用树扫描）
  account.rs            WB 槽位：tasklist 检测 →（确认后关进程）→ 备份 → 恢复 → 校验 → 启动 → 回滚
  memory.rs             全局记忆编辑 + .ai/ 桥接（init/sync/consolidate，FNV 块指纹漂移检测）
  usage.rs              用量双源采集 + 聚合（见下「数据源」）
.github/workflows/release.yml   tag v* → Windows amd64 exe → GitHub Release
```

## 关键约定（改代码必读）

1. **打包只出 amd64 exe**：`bundle.targets: []` + `pnpm build:exe`（tauri build --no-bundle）。
   本版本 CLI 不接受 `--bundles none` / `"none"`，勿再尝试。
2. **Tauri IPC 多单词参数**一律收进单个 `input` 结构体（serde 自控），禁止散参 ——
   本版本 IPC 对 snake/camel 大小写映射不稳（踩过 `missing required key base_url`）。
3. **写目标文件三步**：备份到 `~/.agenthub/backups/<域>-<时间戳>/` → 原子写（tmp+rename）→
   JSON 可解析校验；失败回滚。MCP 是合并式写入（只覆盖托管字段，timeout/headers 等非托管字段保留）。
4. **隐私红线**：WB auth 文件只做文件级复制永不读内容；usage 日志只取 usage/元数据字段，
   request.messages / response.text 正文永不入库；API Key 只存 ZCode 目标文件、不落 AgentHub 库。
5. **用量数据源（实测定版，勿回退）**：
   - ZCode：`~/.zcode/cli/db/db.sqlite` 的 `model_usage` 表（SUM(input)=18.87 亿 ≈ 官方 18.9 亿；
     rollout jsonl 只剩近期文件，已废弃，历史事件已一次性清除）
   - WB：`~/.workbuddy/projects/**/*.jsonl` 的 `providerData.rawUsage/usage`（请求级真实 usage；
     rawUsage.credit = 官方积分，与账单同源；prompt_tokens 含缓存命中 → input = prompt − 命中）
   - 采集分批短锁（400 条/批）+ `usage-collect-progress` 事件推前端进度条 + COLLECTING 互斥防重入；
     历史永久留存 `~/.agenthub/agenthub.db`，卸载双 Agent 后仍可查
6. **软链策略**：ZCode 整目录链 → `~/.agenthub/skills`；WB 逐项链；symlink 探测失败降级 junction；
   所有替换先备份实目录。
7. **Skill 市场安装语义**：一律先进中央仓库再分发；「未添加 ≠ 禁用」——单端独有 server 不铺到另一端。
8. **新增 Rust 依赖**（如有）：注意用户机器 rustc 1.98 / cargo 邻域源（rsproxy），锁小版本防漂移。
9. `pnpm build`（tsc 严格模式）与 `cargo check` 双绿才算编译通过；UI 文案中文为主。

## 发布流程

1. 提交遵循 conventional commits（feat: / fix: / refactor: …）——Release 描述由提交主题自动生成。
2. 本地 `pnpm build:exe` 点验通过后，打 tag：`git tag v0.1.0 && git push origin v0.1.0`。
3. GitHub Actions（`.github/workflows/release.yml`）：windows-latest 构建 amd64 exe →
   生成带编号变更列表 → 创建 Release 并上传 `AgentHub_v*_x64.exe`。
4. 守卫：tag 必须在 main 分支历史上。

## 踩坑备忘（摘要，详见 .ai/memory/2026-10-31.md）

- rusqlite `last_insert_rowid()` 在 ON CONFLICT UPDATE 路径不可靠 → upsert 后显式 SELECT。
- SELECT 列与 `row.get` 索引一一对应（加列后全体 +1）。
- `bundle.targets` 不接受 "none"；exe-only = 空数组 + `--no-bundle`。
- 打包前必须 `taskkill agenthub.exe`（运行中的 exe 拒绝替换）。
- sed 改过的文件必须重新 Read 再 Edit。
