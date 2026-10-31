# AgentHub · AI Agent 统一管理工具

面向 **WorkBuddy 与 ZCode** 双 Agent 的 Skills / MCP / 第三方模型 / WB 多账号 / Memory / 用量分析一站式管理台。替代已卸载的 cc-switch，中央仓库一份配置、双端生效。

- 技术栈：Tauri v2 + React 19 + Zustand + UnoCSS + SQLite（rusqlite）+ pnpm
- 平台：Windows（amd64 单文件 exe，免安装）
- 定位：个人本地工具，数据全部存本机 `~/.agenthub/`，不外发

## 功能一览

- **Usage**：双 Agent 健康概览 + 用量分析。请求级真实 token 统计（ZCode 读本地 `model_usage` 账本、WB 读 `projects` 请求级日志），历史区间（日/近一周/近一月/近三月/近半年/今年/全部）+ 任意月份切换 + Agent 三开关（汇总/WorkBuddy/ZCode）；ECharts 日历热力 / 24h 曲线 / 模型细分；WB 官方积分与账单同源。历史永久留存本机，卸载双 Agent 后仍可查
- **Skills**：中央仓库 `~/.agenthub/skills` 一处管理，双端软链分发（WB 逐项链 / ZCode 整目录链）；已安装 / 未安装 / 全部三视图；内置三大开源市场（anthropics/skills、obra/superpowers、cexll/myclaude）一键安装
- **MCP**：统一定义一处维护，翻译写入 WB `mcp.json` 与 ZCode `cli/config.json`；请求级双端开关、漂移检测、JSON 批量导入（headers 支持）
- **Models**：第三方 Provider 一次配置直写 ZCode；`/v1/models` 候选链在线拉取模型列表（勾选制不手写模型名，GLM 系网关自动回退内置推荐）；API Key 只存目标文件
- **Account**：WorkBuddy 多账号槽位切换——进程检测 → 备份 → 恢复 → 校验 → 自动重启 WB，失败自动回滚；auth 文件只做文件级复制，永不读取内容
- **Memory**：全局记忆（WB 双账号 + ZCode AGENTS.md）查看/编辑/自动快照；项目记忆 `.ai/` 桥接（幂等注入指令文件、漂移检测、跨 Agent 蒸馏合并）
- **Setting**：明暗主题、开机自启、关闭进托盘、操作日志

## 快速开始

从 [Releases](https://github.com/WHF293/AgentManage/releases) 下载 `AgentHub_v*_x64.exe`，双击运行（免安装）。

首次使用：

1. **Skills** 岛点「一键迁移」——把双端现有 skills 并集导入中央仓库并重建软链（被替换目录自动备份）
2. **MCP** 岛点「收编进统一定义」——接管双端现有 MCP server
3. **Account** 岛登录 WB 后「保存当前登录为槽位」，即可在多账号间一键切换
4. **Usage** 岛自动提取本地历史用量（首次约十几秒，之后增量）

## 开发

```bash
pnpm install
pnpm tauri:dev      # 桌面开发
pnpm build          # 类型检查 + 前端构建
pnpm build:exe      # 只出 Windows amd64 exe（项目定版）
```

面向 AI 编码代理的工程指南见 [AGENTS.md](./AGENTS.md)。

## 发布

提交遵循 conventional commits；打 `v*` tag 推送后，GitHub Actions 自动在 windows-latest 构建 amd64 exe 并发布 Release（带自动生成的变更列表）。

## 数据与隐私

- 所有数据保存在本机 `~/.agenthub/`（SQLite 单一事实源 + 时间戳备份），不联网上传
- 用量分析只解析 usage 与元数据字段，对话正文永不入库
- API Key 只保存在 ZCode 自身配置文件中，AgentHub 数据库不存储密钥
- WB 登录态（auth）仅做文件级复制，永不读取内容
