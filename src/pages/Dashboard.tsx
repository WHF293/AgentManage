import { useCallback, useEffect, useState } from 'react';
import { getAppStatus, recentOpLog, type AppStatus, type OpLogRow } from '../api';
import { PageHeader } from '../common/components/PageHeader';
import { useThemeStore } from '../stores/theme';
import { UsagePage } from './Usage';

function AgentCard({
  name,
  sub,
  status,
  detail,
  ready,
}: {
  name: string;
  sub: string;
  status: 'ok' | 'warn' | 'off';
  detail: string;
  ready: boolean;
}) {
  const chip = status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'off';
  const label = !ready ? '未接入' : status === 'ok' ? '● 配置正常' : '● 待处理';
  return (
    <div className="card hover-zoom" style={{ padding: 14 }}>
      <div className="flex items-center justify-between">
        <b style={{ fontSize: 13 }}>{name}</b>
        <span className={`chip ${chip}`}>{label}</span>
      </div>
      <div style={{ color: 'var(--color-text-3)', fontSize: 11, margin: '6px 0' }}>{sub}</div>
      <div className="bar">
        <i style={{ width: ready ? '100%' : '0%' }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 4 }}>{detail}</div>
    </div>
  );
}

/** 概览信息弹窗（右上角 icon 打开）：同步健康 / 最近操作 / 主题 */
function InfoModal({ status, ops, onClose }: { status: AppStatus | null; ops: OpLogRow[]; onClose: () => void }) {
  const { resolved, setMode } = useThemeStore();
  const central = status?.central_skills_count ?? 0;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.35)',
        zIndex: 150,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 560, maxHeight: '80vh', overflow: 'auto', cursor: 'default', padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 14 }}>同步概览</b>
          <span style={{ flex: 1 }} />
          <span className="icon-round" onClick={onClose} title="关闭">✕</span>
        </div>
        <div className="list">
          <div className="li">
            <div className="ic">▤</div>
            <div className="grow">
              <div className="nm">Skills 双端一致</div>
              <div className="ds">
                中央仓库 {central} 个 ·
                {central === 0
                  ? ' 待一键迁移（Skills 岛）'
                  : ` WB ${status?.workbuddy.skills_count ?? 0} · ZCode ${status?.zcode.skills_count ?? 0}`}
              </div>
            </div>
            <span className={`chip ${central > 0 ? 'ok' : 'warn'}`}>{central > 0 ? '已就绪' : '待迁移'}</span>
          </div>
          <div className="li">
            <div className="ic">⌗</div>
            <div className="grow">
              <div className="nm">MCP 统一定义</div>
              <div className="ds">WB mcp.json（disabled）× ZCode cli/config.json（enabled）翻译同步</div>
            </div>
            <span className="chip ok">MCP 岛</span>
          </div>
          <div className="li">
            <div className="ic">✦</div>
            <div className="grow">
              <div className="nm">模型 Provider</div>
              <div className="ds">一次配置双端同步 · /v1/models 候选链在线拉取</div>
            </div>
            <span className="chip ok">Models 岛</span>
          </div>
          <div className="li">
            <div className="ic">↻</div>
            <div className="grow">
              <div className="nm">最近操作（op_log）</div>
              <div className="ds">
                {ops.length === 0
                  ? '暂无写操作记录'
                  : ops
                      .slice(0, 2)
                      .map((o) => `${o.created_at ?? ''} ${o.action} ${o.target ?? ''}`)
                      .join(' · ')}
              </div>
            </div>
            <span className="chip off">{ops.length} 条</span>
          </div>
          <div className="li">
            <div className="ic">◐</div>
            <div className="grow">
              <div className="nm">主题</div>
              <div className="ds">CSS variables 双主题 · 当前{resolved === 'dark' ? '深色' : '浅色'}</div>
            </div>
            <span
              className={`chip ${resolved === 'dark' ? 'off' : 'ok'}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
            >
              切换
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Usage 岛（原总览 + 用量合并）：双 Agent 健康 + 用量分析，概览收进右上角 icon 弹窗 */
export function DashboardPage() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [ops, setOps] = useState<OpLogRow[]>([]);
  const [showInfo, setShowInfo] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [st, log] = await Promise.all([getAppStatus(), recentOpLog(5)]);
      setStatus(st);
      setOps(log);
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
      <PageHeader title="Usage" sub="两个 Agent · 一份配置 · 双端生效" />

      <div className="mb-3 flex items-center">
        <span style={{ flex: 1 }} />
        <button className="icon-round" title="同步概览（Skills / MCP / 模型 / 最近操作 / 主题）" onClick={() => setShowInfo(true)}>
          ▦
        </button>
      </div>

      {/* 双 Agent 健康卡 */}
      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <AgentCard
          name="WorkBuddy"
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

      {/* 用量分析（原用量岛整体嵌入） */}
      <UsagePage />

      {showInfo && <InfoModal status={status} ops={ops} onClose={() => setShowInfo(false)} />}
    </div>
  );
}
