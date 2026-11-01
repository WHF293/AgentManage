import { useCallback, useEffect, useState } from 'react';
import { pluginList, pluginToggle, type PluginInfo } from '../api';
import { refreshPlugins } from '../stores/plugins';
import { agentMeta, getConfiguredColor, setAgentColor } from '../agents';
import { PageHeader } from '../common/components/PageHeader';
import { toast } from '../stores/ui';

/** 预设色板：与 UI 主题协调的一组身份色 */
const PRESET_COLORS = [
  '#2E9E74', '#4CC79C', '#4AA3DF', '#5B8DEF', '#8B5CF6',
  '#C05FD9', '#E8698D', '#D96459', '#D99A2B', '#5FB861',
  '#3BB0C9', '#6B7FDB',
];

/** Agent 主题色设置弹窗：预设色板 + 自定义取色器 + 恢复默认，保存后全局立即生效 */
function ColorDialog({
  agentId,
  agentName,
  onClose,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
}) {
  const meta = agentMeta(agentId);
  const configured = getConfiguredColor(agentId);
  const [sel, setSel] = useState<string>(configured ?? meta.defaultColor ?? '#8CA096');

  const commit = (color: string | null) => {
    setAgentColor(agentId, color);
    toast(`${agentName} 主题色已更新（全局立即生效）`);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: 420, cursor: 'default', padding: 20 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center" style={{ gap: 9 }}>
          <span
            style={{ width: 14, height: 14, borderRadius: 999, background: sel, flex: 'none', boxShadow: '0 0 0 3px color-mix(in srgb, currentColor 8%, transparent)' }}
          />
          <b style={{ fontSize: 14 }}>{agentName} · 主题色</b>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-3)', marginTop: 5 }}>
          该颜色将全局生效：开关、chip、卡片高亮、用量图表、主按钮等所有身份色位置
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-2)', margin: '14px 0 8px' }}>预设色板</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setSel(c)}
              style={{
                width: '100%', aspectRatio: '1', borderRadius: 9, border: sel === c ? '2.5px solid var(--color-text-1)' : '2.5px solid transparent',
                background: c, cursor: 'pointer', padding: 0, outline: sel === c ? '2px solid var(--color-surface)' : undefined,
              }}
            />
          ))}
        </div>

        <div className="flex items-center" style={{ gap: 10, marginTop: 14 }}>
          <label
            className="flex items-center"
            style={{ gap: 8, fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-2)', cursor: 'pointer' }}
          >
            自定义
            <input
              type="color"
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              style={{ width: 34, height: 26, border: '1px solid var(--color-border)', borderRadius: 7, cursor: 'pointer', padding: 0, background: 'none' }}
            />
          </label>
          <span style={{ fontSize: 11, color: 'var(--color-text-3)', fontFamily: 'Consolas, monospace' }}>{sel.toUpperCase()}</span>
        </div>

        <div className="flex items-center" style={{ gap: 8, marginTop: 18 }}>
          {configured && (
            <button className="btn gh" onClick={() => commit(null)}>
              ↺ 恢复默认
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn gh" onClick={onClose}>取消</button>
          <button className="btn p" onClick={() => commit(sel)}>保存</button>
        </div>
      </div>
    </div>
  );
}

/** 单个适配器插件卡片 */
function PluginCard({
  p,
  onToggle,
  toggling,
  onColor,
}: {
  p: PluginInfo;
  onToggle: (agent: string, enabled: boolean) => void;
  toggling: string | null;
  onColor: (agent: string) => void;
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
                title="点击设置主题色（全局生效）"
                style={{
                  width: 9, height: 9, borderRadius: 999, background: meta.accentVar, flex: 'none',
                  cursor: 'pointer', boxShadow: '0 0 0 2px color-mix(in srgb, currentColor 10%, transparent)',
                  transition: 'transform .15s',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onColor(p.agent);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.35)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
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
  const [colorDlg, setColorDlg] = useState<string | null>(null);

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
            <PluginCard key={p.agent} p={p} onToggle={toggle} toggling={toggling} onColor={setColorDlg} />
          ))}
        </div>
      )}

      {colorDlg && (
        <ColorDialog
          agentId={colorDlg}
          agentName={agentMeta(colorDlg).name}
          onClose={() => setColorDlg(null)}
        />
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
          <br />· 点 agent 名旁的<b>色点</b>可自定义该 agent 的主题色（预设色板 / 自定义取色器），
          全局生效并持久化；新 agent 注册即有默认身份色。
        </div>
      </div>
    </div>
  );
}
