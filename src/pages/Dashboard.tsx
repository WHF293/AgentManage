import { useCallback, useEffect, useState } from 'react';
import { getAppStatus, type AppStatus } from '../api';
import { AgentCard } from '../common/components/AgentCard';
import { UsagePage } from './Usage';

/** Usage 岛：双 Agent 健康 + 用量分析（概览信息已并入 Setting 岛，页头行已删除） */
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

  const wbReady = status?.workbuddy.installed ?? false;
  const zcReady = status?.zcode.installed ?? false;

  return (
    <div>
      {/* 双 Agent 健康卡 */}
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <AgentCard
          name="WorkBuddy"
          agent="wb"
          sub="~/.workbuddy · skills 逐项链 / mcp.json / memory / 账号槽位"
          status={wbReady && (status?.workbuddy.skills_count ?? 0) > 0 ? 'ok' : wbReady ? 'warn' : 'off'}
          detail={
            wbReady
              ? `skills 目录${status?.workbuddy.skills_dir_is_link ? '（软链）' : ''} · ${status?.workbuddy.skills_count ?? 0} 项 · 登录态${status?.auth_info_found ? '已找到' : '未找到'}`
              : '未检测到 ~/.workbuddy'
          }
          ready={wbReady}
        />
        <AgentCard
          name="ZCode"
          agent="zcode"
          sub="~/.zcode · skills 整目录链 / cli config / v2 providers"
          status={zcReady && (status?.zcode.skills_count ?? 0) > 0 ? 'ok' : zcReady ? 'warn' : 'off'}
          detail={
            zcReady
              ? `skills 目录${status?.zcode.skills_dir_is_link ? '（软链 → 中央仓库）' : '（实目录，待迁移）'} · ${status?.zcode.skills_count ?? 0} 项`
              : '未检测到 ~/.zcode'
          }
          ready={zcReady}
        />
      </div>

      {/* 用量分析 */}
      <UsagePage />
    </div>
  );
}
