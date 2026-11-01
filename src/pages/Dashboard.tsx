import { useCallback, useEffect, useState } from 'react';
import { getAppStatus, type AppStatus } from '../api';
import { agentMeta } from '../agents';
import { AgentCard } from '../common/components/AgentCard';
import { UsagePage } from './Usage';

/** Usage 岛：已启用插件的健康卡 + 用量分析（概览信息已并入 Setting 岛，页头行已删除） */
export function DashboardPage() {
  const [status, setStatus] = useState<AppStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await getAppStatus());
    } catch {
      /* IPC 未就绪（浏览器预览）时保持空态 */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  // 只展示已启用插件（停用的适配器对用户不可见，Plugin 岛可再开启）
  const shown = (status?.agents ?? []).filter((a) => a.plugin_enabled);

  return (
    <div>
      {/* 已启用插件健康卡 */}
      <div
        className="mb-3 grid gap-2.5"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
      >
        {shown.map((a) => {
          const meta = agentMeta(a.agent);
          const wbAuth = a.agent === 'workbuddy' ? ` · 登录态${a.auth_found ? '已找到' : '未找到'}` : '';
          return (
            <AgentCard
              key={a.agent}
              name={a.display_name}
              accent={meta.accentVar}
              sub={`~/.${a.agent} · 已启用插件`}
              status={a.installed && a.skills_count > 0 ? 'ok' : a.installed ? 'warn' : 'off'}
              detail={
                a.installed
                  ? `skills 目录${a.skills_dir_is_link ? '（软链）' : ''} · ${a.skills_count} 项${wbAuth}`
                  : `未检测到 ~/.${a.agent}（Plugin 岛可停用该插件）`
              }
              ready={a.installed}
            />
          );
        })}
        {shown.length === 0 && (
          <div className="card" style={{ padding: 14, color: 'var(--color-text-3)', fontSize: 12 }}>
            尚未启用任何 agent 插件 —— 到 Plugin 岛开启。
          </div>
        )}
      </div>

      {/* 用量分析 */}
      <UsagePage />
    </div>
  );
}
