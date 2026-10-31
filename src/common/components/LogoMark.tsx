/**
 * AgentHub Logo 两版 SVG（资源定版见 UI 稿 A 节）：
 * - LogoMark：透明底 stroke Mark（标题栏 / 侧栏 / 空态），currentColor 随主题
 * - LogoBadge：淡绿渐变圆角方形（App 图标同源，用于强调位）
 */

export function LogoMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ flex: 'none' }} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth={34} strokeLinecap="round">
        <circle cx="256" cy="216" r="78" />
        <path d="M192 280 L142 350" />
        <path d="M320 280 L370 350" />
      </g>
      <circle cx="256" cy="216" r={size > 40 ? 18 : 16} fill="currentColor" />
      <circle cx="132" cy="376" r="40" fill="none" stroke="currentColor" strokeWidth={34} />
      <circle cx="380" cy="376" r="40" fill="none" stroke="currentColor" strokeWidth={34} />
    </svg>
  );
}

export function LogoBadge({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ flex: 'none' }} aria-hidden="true">
      <defs>
        <linearGradient id="agenthub-logo-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7ED8B4" />
          <stop offset="1" stopColor="#2E9E74" />
        </linearGradient>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="112" fill="url(#agenthub-logo-lg)" />
      <circle cx="256" cy="238" r="74" fill="none" stroke="#FFFFFF" strokeWidth="26" />
      <circle cx="256" cy="238" r="14" fill="#FFFFFF" />
      <path d="M196 296 L150 356" stroke="#FFFFFF" strokeWidth="22" strokeLinecap="round" />
      <path d="M316 296 L362 356" stroke="#FFFFFF" strokeWidth="22" strokeLinecap="round" />
      <circle cx="140" cy="382" r="34" fill="#FFFFFF" />
      <circle cx="140" cy="382" r="12" fill="#2E9E74" />
      <circle cx="372" cy="382" r="34" fill="#FFFFFF" />
      <circle cx="372" cy="382" r="12" fill="#2E9E74" />
    </svg>
  );
}
