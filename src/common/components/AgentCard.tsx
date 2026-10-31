/** 双 Agent 健康卡（Usage 岛顶部）；agent 传入时以身份色强化（wb=绿 / zcode=蓝） */
export function AgentCard({
  name,
  sub,
  status,
  detail,
  ready,
  agent,
}: {
  name: string;
  sub: string;
  status: 'ok' | 'warn' | 'off';
  detail: string;
  ready: boolean;
  agent?: 'wb' | 'zcode';
}) {
  const chip = status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'off';
  const label = !ready ? '未接入' : status === 'ok' ? '● 配置正常' : '● 待处理';
  const accent =
    agent === 'zcode' ? 'var(--color-agent-zcode)' : agent === 'wb' ? 'var(--color-agent-wb)' : undefined;
  return (
    <div className="card hover-zoom" style={{ padding: 14 }}>
      <div className="flex items-center justify-between">
        <b style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          {accent && <span style={{ width: 8, height: 8, borderRadius: 999, background: accent, flex: 'none' }} />}
          {name}
        </b>
        <span className={`chip ${chip}`}>{label}</span>
      </div>
      <div style={{ color: 'var(--color-text-3)', fontSize: 11, margin: '6px 0' }}>{sub}</div>
      <div className="bar">
        <i style={{ width: ready ? '100%' : '0%', background: accent }} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginTop: 4 }}>{detail}</div>
    </div>
  );
}
