import { useCallback, useEffect, useState } from 'react';
import { pluginList, pluginToggle, type PluginInfo } from '../api';
import { refreshPlugins } from '../stores/plugins';
import { agentMeta } from '../agents';
import { PageHeader } from '../common/components/PageHeader';

/** 单个适配器插件卡片 */
function PluginCard({
  p,
  onToggle,
  toggling,
}: {
  p: PluginInfo;
  onToggle: (agent: string, enabled: boolean) => void;
  toggling: string | null;
}) {
  const meta = agentMeta(p.agent);
  return (
    <div className="item-card sm" style={{ opacity: p.enabled ? 1 : 0.72 }}>
      <div className="card-top">
        <span
          className={`sw${p.enabled ? ' on' : ''}`}
          style={meta.accentVar && p.enabled ? { background: meta.accentVar } : undefined}
          title={p.enabled ? '已启用（点击停用）' : '已停用（点击启用）'}
          onClick={() => !toggling && onToggle(p.agent, !p.enabled)}
        />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="nm flex items-center" style={{ gap: 7 }}>
            {meta.accentVar && (
              <span
                style={{ width: 8, height: 8, borderRadius: 999, background: meta.accentVar, flex: 'none' }}
              />
            )}
            {p.display_name}
          </div>
        </div>
        <span
          className={`chip ${p.enabled ? 'ok' : 'off'}`}
          title={p.source === 'auto' ? '首次运行时按本机安装探测自动启用' : '由用户手动开启/关闭'}
        >
          {p.enabled ? '已启用' : '已停用'}
        </span>
      </div>
      <div className="ds desc-clamp" style={{ flex: 1, minHeight: 0 }} title={p.desc}>
        {p.desc}
      </div>
      <div className="card-actions">
        <span className={`chip ${p.installed ? 'ok' : 'warn'}`} title="本机安装探测（目录存在性）">
          {p.installed ? '✓ 已检测到安装' : '未检测到安装'}
        </span>
        {p.caps.skills && <span className="chip off">skills</span>}
        {p.caps.mcp && <span className="chip off">mcp</span>}
        {p.source === 'auto' && <span className="chip off">自动启用</span>}
      </div>
    </div>
  );
}

/** Plugin 岛 —— 可插拔 agent 适配器管理 */
export function PluginsPage() {
  const [items, setItems] = useState<PluginInfo[] | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setItems((await pluginList()).items);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = async (agent: string, enabled: boolean) => {
    setToggling(agent);
    setError(null);
    setMessage(null);
    try {
      await pluginToggle(agent, enabled);
      refreshPlugins();
      const meta = agentMeta(agent);
      setMessage(
        `${meta.name} 插件已${enabled ? '启用' : '停用'}（已持久化；Account / Model / Memory 等岛已同步置灰或隐藏停用端）`,
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setToggling(null);
    }
  };

  const enabledCount = (items ?? []).filter((p) => p.enabled).length;

  return (
    <div>
      <PageHeader
        title={`Plugin（${items?.length ?? '…'}）`}
        sub={`适配器即插件 · 已启用 ${enabledCount ?? '…'} 个 · 首次运行按本机安装自动启用，之后以本页开关为准（持久化）`}
      />

      <div className="mb-3 flex items-center" style={{ gap: 8 }}>
        <span style={{ flex: 1 }} />
        {message && <span className="chip ok">{message}</span>}
        <button
          className="btn gh"
          onClick={() => {
            void refresh();
          }}
        >
          ↻ 重新探测
        </button>
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-danger)',
            background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </div>
      )}

      {items === null ? (
        <div className="card" style={{ color: 'var(--color-text-3)' }}>加载中…</div>
      ) : items.length === 0 ? (
        <div className="card" style={{ color: 'var(--color-text-3)' }}>无已注册适配器</div>
      ) : (
        <div className="item-grid">
          {items.map((p) => (
            <PluginCard key={p.agent} p={p} onToggle={toggle} toggling={toggling} />
          ))}
        </div>
      )}

      <div className="card" style={{ padding: 14, marginTop: 12 }}>
        <b style={{ fontSize: 12.5 }}>工作方式</b>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', lineHeight: 1.7, marginTop: 6 }}>
          · 每个 agent 适配器 = 一个插件：WorkBuddy / ZCode 为内置，后续 claude / codex / trae
          等由社区按 AgentAdapter 接口贡献，装上即出现在这里。
          <br />
          · 首次开启应用自动探测本机安装了哪些 agent 并默认启用；其余必须在本页手动开启。
          <br />
          · 开关状态持久化保存（~/.agenthub/agenthub.db 的 plugin_state 表），后续打开优先读取用户配置，不会自动变更。
          <br />· 停用插件不影响历史数据：Usage 岛保留其已采集的用量，重新启用后恢复增量采集与分发。
        </div>
      </div>
    </div>
  );
}
