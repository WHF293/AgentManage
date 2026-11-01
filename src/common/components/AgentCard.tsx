/** agent 健康卡（Usage 岛顶部）；accent 传入时以身份色强化（WorkBuddy=绿 / ZCode=蓝 / 其他=注册表色） */
export function AgentCard({
  name,
  sub,
  status,
  detail,
  ready,
  accent,
}: {
  name: string;
  sub: string;
  status: 'ok' | 'warn' | 'off';
  detail: string;
  ready: boolean;
  /** 身份色 CSS 变量（src/agents.ts 注册表） */
  accent?: string;
}) {
  const chip = status === 'ok' ? 'ok' : status === 'warn' ? 'warn' : 'off';
  const label = !ready ? '未接入' : status === 'ok' ? '● 配置正常' : '● 待处理';
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
