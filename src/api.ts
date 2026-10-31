import { invoke } from '@tauri-apps/api/core';

// ─── 与 Rust serde 结构一一对应（字段名保持 snake_case） ───

export interface AgentStatus {
  installed: boolean;
  skills_dir: string;
  skills_dir_is_link: boolean;
  skills_dir_target: string | null;
  skills_count: number;
}

export interface AppStatus {
  hub_initialized: boolean;
  central_skills_count: number;
  link_mode: 'symlink' | 'junction' | 'copy';
  workbuddy: AgentStatus;
  zcode: AgentStatus;
  auth_info_found: boolean;
}

export interface ImportedSkill {
  name: string;
  from: string;
  took: string;
}

export interface MigrateReport {
  central_dir: string;
  link_mode: string;
  imported: ImportedSkill[];
  skipped_existing: number;
  import_warnings: string[];
  wb_relinked: string[];
  wb_kept: string[];
  wb_failed: string[];
  zcode_action: string;
  warnings: string[];
}

export type LinkStatus = 'linked' | 'diverged' | 'broken' | 'missing';

export interface SkillOverviewItem {
  name: string;
  description: string | null;
  source: string;
  source_ref: string | null;
  enabled: boolean;
  wb: LinkStatus;
  zcode: LinkStatus;
  zcode_whole_link: boolean;
  /** WB 端「允许模型自动调用」实测（null = WB 存储未收录） */
  wb_auto: boolean | null;
}

export interface OpLogRow {
  id: number;
  action: string;
  target: string | null;
  detail_json: string | null;
  created_at: string | null;
}

// ─── invoke 封装 ───

export const getAppStatus = () => invoke<AppStatus>('app_status');

export const runSkillsMigration = (mode?: string) =>
  invoke<MigrateReport>('run_skills_migration', { mode });

export const skillsOverview = () => invoke<SkillOverviewItem[]>('skills_overview');

export const relinkSkill = (name: string, agent: 'workbuddy' | 'zcode') =>
  invoke<string>('relink_skill', { name, agent });

/** 启停：DB 状态 + 写穿 WB「允许模型自动调用」，返回同步结果消息 */
export const setSkillEnabled = (name: string, enabled: boolean) =>
  invoke<string>('set_skill_enabled', { name, enabled });

export const skillDelete = (name: string) => invoke<void>('skill_delete', { name });

export interface PluginSkillItem {
  /** 运行时技能名（plugin:目录名，如 github:commit） */
  name: string;
  plugin: string;
  plugin_version: string;
  description: string | null;
  plugin_enabled: boolean;
}

export const zcodePluginSkills = () => invoke<PluginSkillItem[]>('zcode_plugin_skills');

export const recentOpLog = (limit = 20) => invoke<OpLogRow[]>('recent_op_log', { limit });

// ─── M3 MCP ───

export interface McpOverviewItem {
  name: string;
  type: string;
  command: string | null;
  url: string | null;
  enabled_wb: boolean;
  enabled_zcode: boolean;
  wb_status: 'ok' | 'disabled' | 'missing' | 'drifted';
  zcode_status: 'ok' | 'disabled' | 'missing' | 'drifted' | 'unsupported';
  zcode_unsupported: boolean;
}

export interface McpDrift {
  wb_only: string[];
  zcode_only: string[];
}

export interface McpOverviewPayload {
  items: McpOverviewItem[];
  drift: McpDrift;
}

export interface McpServerInput {
  name: string;
  type: string;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  headers?: Record<string, string>;
  enabled_wb: boolean;
  enabled_zcode: boolean;
}

export const mcpOverview = () => invoke<McpOverviewPayload>('mcp_overview');
export const mcpAdopt = (overwrite: boolean) =>
  invoke<number>('mcp_adopt', { overwrite });
export const mcpSave = (server: McpServerInput) =>
  invoke<void>('mcp_save', { server });
export const mcpToggle = (name: string, agent: 'workbuddy' | 'zcode', enabled: boolean) =>
  invoke<void>('mcp_toggle', { name, agent, enabled });
export const mcpDelete = (name: string) => invoke<void>('mcp_delete', { name });
export const mcpValidate = () => invoke<McpOverviewPayload>('mcp_validate');

// ─── M4 模型 ───

export interface ZcodeProviderLive {
  id: string;
  name: string;
  kind: 'anthropic' | 'openai-compatible' | string;
  base_url: string;
  has_api_key: boolean;
  models: string[];
  builtin: boolean;
  /** 已写穿到 WB models.json 的本 provider 模型（DB 托管清单 ∩ 文件现存 id） */
  wb_models: string[];
}

export interface ProvidersOverview {
  providers: ZcodeProviderLive[];
  selected_keys: Record<string, string>;
}

export interface FetchTrace {
  url: string;
  status: number | null;
  ms: number;
  ok: boolean;
  note: string;
}

export interface FetchResult {
  models: string[];
  traces: FetchTrace[];
  /** 全部候选失败时来自内置推荐列表（部分网关不提供 /v1/models） */
  suggested: boolean;
}

export const providersOverview = () => invoke<ProvidersOverview>('providers_overview');

export const providerFetchModels = (input: {
  id: string;
  kind: string;
  base_url: string;
  api_key?: string;
  models_url?: string;
}) => invoke<FetchResult>('provider_fetch_models', { input });

export const providerSave = (input: {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  api_key?: string;
  models?: string[];
}) => invoke<string>('provider_save', { input });

export const providerDelete = (id: string) => invoke<string>('provider_delete', { id });

export const providerSetDefault = (family: string, key: string) =>
  invoke<void>('provider_set_default', { family, key });

// ─── M5 WB 账号 ───

export interface AccountMeta {
  uid: string;
  uin: string;
  nickname: string;
}

export interface WbSlot {
  id: string;
  label: string;
  uid: string;
  uin: string;
  saved_at: string;
  file_ok: boolean;
}

export interface WbOverview {
  auth_found: boolean;
  current: AccountMeta;
  process_running: boolean;
  wb_installed: boolean;
  slots: WbSlot[];
}

export interface SwitchReport {
  ok: boolean;
  steps: string[];
  error: string | null;
}

export const wbOverview = () => invoke<WbOverview>('wb_overview');
export const wbSaveSlot = (label: string) => invoke<WbSlot>('wb_save_slot', { label });
export const wbSwitch = (slotId: string, confirmKill: boolean) =>
  invoke<SwitchReport>('wb_switch', { input: { slot_id: slotId, confirm_kill: confirmKill } });
export const wbImportLegacy = () => invoke<number>('wb_import_legacy');
export const wbDeleteSlot = (slotId: string) => invoke<void>('wb_delete_slot', { slot: slotId });

// ─── M9 用量 ───

export interface AgentTotal {
  agent: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  /** 官方逐请求积分（WB rawUsage.credit 与账单同源；ZCode 恒为 0） */
  credit: number;
}

export interface ModelBreakdown {
  agent: string;
  model: string;
  calls: number;
  tokens: number;
}

export interface CurvePoint {
  bucket: number;
  agent: string;
  tokens: number;
}

export interface HeatCell {
  date: string;
  agent: string;
  tokens: number;
  calls: number;
}

export interface UsageOverview {
  range: string;
  totals: AgentTotal[];
  models: ModelBreakdown[];
  curve: CurvePoint[];
  heatmap: HeatCell[];
  /** 日历视图窗口（YYYY-MM-DD 或 YYYY-MM） */
  cal_start: string;
  cal_end: string;
  today: string;
}

export interface MatrixCell {
  date: string;
  agent: string;
  model: string;
  tokens: number;
  calls: number;
}

export const usageCollect = () =>
  invoke<[number, number]>('usage_collect');

export const usageOverview = (range: string) =>
  invoke<UsageOverview>('usage_overview', { range });

export const usageMatrix = () => invoke<MatrixCell[]>('usage_matrix');

// ─── 在线更新 ───

export interface UpdateCheckInfo {
  current: string;
  latest: string;
  has_update: boolean;
  tag: string;
  asset_name: string;
  asset_url: string;
  release_url: string;
}

export const updateCheck = () => invoke<UpdateCheckInfo>('update_check');

export const updateInstall = (info: { tag: string; asset_name: string; asset_url: string }) =>
  invoke<void>('update_install', { input: info });

// ─── M7 Skill 市场 ───

export interface MarketSkill {
  name: string;
  description: string;
  source: string;
  source_name: string;
  installed: boolean;
}

export interface MarketCatalog {
  skills: MarketSkill[];
  warnings: string[];
}

export const marketRefresh = () => invoke<MarketCatalog>('market_refresh');

export const marketInstall = (name: string) =>
  invoke<MarketCatalog>('market_install', { name });

// ─── M6 Memory ───

export interface MemoryFile {
  id: string;
  label: string;
  path: string;
  agent: string;
  readonly_default: boolean;
  size: number;
  updated: string;
}

export interface BridgeStatus {
  file: string;
  injected: boolean;
  drifted: boolean;
}

export interface ProjectInfo {
  path: string;
  name: string;
  ai_ready: boolean;
  bridges: BridgeStatus[];
  consolidate_candidates: number;
}

export const memoryGlobalList = () => invoke<MemoryFile[]>('memory_global_list');
export const memoryRead = (path: string) => invoke<string>('memory_read', { path });
export const memoryWrite = (path: string, content: string, allowZcodeAgents: boolean) =>
  invoke<void>('memory_write', { input: { path, content, allow_zcode_agents: allowZcodeAgents } });
export const memoryGlobalUnify = () => invoke<string[]>('memory_global_unify');
export const projectsOverview = () => invoke<ProjectInfo[]>('projects_overview');
export const projectInit = (path: string) => invoke<string[]>('project_init', { path });
export const projectSync = (path: string) => invoke<string[]>('project_sync', { path });
export const projectConsolidate = (path: string) =>
  invoke<string[]>('project_consolidate', { path });
