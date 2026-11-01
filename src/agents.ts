/**
 * 前端 agent 注册表 —— 与 Rust adapters::registry() 对应。
 * 新增 agent 适配器（社区贡献）时在此补一条：id 稳定、身份色可自定义
 * （色值加到 theme.css 的 --color-agent-<id>，未知 agent 自动回落中性样式）。
 */
export interface AgentMeta {
  id: string;
  name: string;
  /** 身份色 CSS 变量（theme.css 定义；undefined = 中性色） */
  accentVar?: string;
  /** chip 的身份色 class（zc = 蓝，wb 走默认 ok 绿；undefined = 默认） */
  chipClass?: string;
}

export const AGENTS: Record<string, AgentMeta> = {
  workbuddy: { id: 'workbuddy', name: 'WorkBuddy', accentVar: 'var(--color-agent-wb)' },
  zcode: { id: 'zcode', name: 'ZCode', accentVar: 'var(--color-agent-zcode)', chipClass: 'zc' },
};

/** 按 id 取元信息；未注册的 agent（未来社区适配器）回落中性展示 */
export function agentMeta(id: string): AgentMeta {
  return AGENTS[id] ?? { id, name: id };
}

/** chip 正常态 class：注册表有身份色用之，否则默认 ok 绿 */
export function agentChipClass(id: string, fallback = 'ok'): string {
  const meta = AGENTS[id];
  return meta?.chipClass ?? fallback;
}
