import { NAV_ITEMS, useNavStore } from '../stores/nav';
import { LogoBadge, LogoMark } from '../common/components/LogoMark';

/** 8 岛速览卡（与侧栏一致；点击直接跳转） */
const ISLANDS: { icon: string; name: string; desc: string; page: (typeof NAV_ITEMS)[number]['id'] }[] = [
  {
    icon: '▦',
    name: 'Usage · 用量分析',
    desc: '请求级真实用量与官方积分同源：日历下钻、模型细分、账号维度筛选；已启用插件健康卡一眼看全。历史永久留存本机，卸载双 Agent 后仍可查。',
    page: 'dashboard',
  },
  {
    icon: '⇄',
    name: 'Account · 账号槽位',
    desc: 'WorkBuddy / ZCode 多账号切换：保存当前登录态为槽位，一键切回（先备份再写入，失败自动回滚）；支持每日签到领积分、积分余额管理、WB 会话跨账号复制。',
    page: 'accounts',
  },
  {
    icon: '▤',
    name: 'Skill · 技能',
    desc: '技能中央仓库统一存放（~/.agenthub/skills），按各端策略软链分发到 WorkBuddy / ZCode；三大开源市场一键安装，端侧漂移自动巡检。',
    page: 'skills',
  },
  {
    icon: '⌗',
    name: 'MCP · 服务器',
    desc: 'MCP 统一定义一处维护，AgentHub 自动翻译写入双端各自格式；合并式写入只覆盖托管字段，支持批量导入与按端启用。',
    page: 'mcp',
  },
  {
    icon: '✦',
    name: 'Model · 第三方模型',
    desc: '接入自有 API Provider：直写 ZCode 配置、写穿 WB models.json；/v1/models 候选链自动探测可用模型，Key 只存目标文件不入库。',
    page: 'models',
  },
  {
    icon: '❑',
    name: 'Memory · 记忆',
    desc: '全局记忆双端统一（一份真身双端符号链接），.ai/ 项目记忆桥接 init/sync/consolidate，跨会话不丢上下文。',
    page: 'memory',
  },
  {
    icon: '⧉',
    name: 'Plugin · 插件',
    desc: '可插拔适配器管理：按端启用/停用，首次运行自动探测已安装的 Agent；停用后该端所有同步操作门控关闭。',
    page: 'plugins',
  },
  {
    icon: '⚙',
    name: 'Setting · 设置',
    desc: '主题（明/暗/跟随系统）、开机自启、关闭进托盘、更新代理、默认打开页与最近操作日志。',
    page: 'settings',
  },
];

const QUICK_STEPS: {
  n: number; t: string; d: string; tip: string; page: (typeof NAV_ITEMS)[number]['id'];
}[] = [
  {
    n: 1, t: '确认插件', page: 'plugins',
    d: 'Plugin 岛确认 WorkBuddy / ZCode 已启用',
    tip: '首次运行会按本机安装情况自动探测并启用，无需手动安装',
  },
  {
    n: 2, t: '保存账号槽位', page: 'accounts',
    d: 'Account 岛把当前登录态保存为槽位',
    tip: '再登录其他账号分别保存，之后一键互切、支持会话跨账号复制',
  },
  {
    n: 3, t: '迁移 Skills / MCP', page: 'skills',
    d: '各端已有技能自动并入中央仓库并建链',
    tip: '首次启动自动完成；MCP 在 MCP 岛统一定义后一键同步双端',
  },
  {
    n: 4, t: '按需接模型', page: 'models',
    d: 'Model 岛填 Provider 与 API Key',
    tip: '/v1/models 候选链自动探测可用模型，Key 只存目标文件不入库',
  },
  {
    n: 5, t: '看用量', page: 'dashboard',
    d: 'Usage 岛查看请求级用量与积分',
    tip: '数据与官方账单同源、历史永久留存本机，日历可下钻到单次请求',
  },
];

/** 使用说明页 —— 首次安装默认打开；顶栏 ❔ icon 可随时回到这里 */
export function HelpPage() {
  const setActive = useNavStore((s) => s.setActive);
  return (
    <div>
      <div
        className="card"
        style={{
          padding: '30px 30px 24px',
          marginBottom: 14,
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--color-primary) 14%, var(--color-surface)) 0%, var(--color-surface) 62%)',
        }}
      >
        {/* 背景 logo 水印：低对比不抢文字，撑住气场 */}
        <div
          style={{
            position: 'absolute', right: -34, top: -38, opacity: 0.06, pointerEvents: 'none',
            transform: 'rotate(-12deg)',
          }}
          aria-hidden="true"
        >
          <LogoMark size={260} />
        </div>

        <div className="flex items-center" style={{ gap: 18, position: 'relative' }}>
          <LogoBadge size={68} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.05 }}>
              Agent<span style={{ color: 'var(--color-primary)' }}>Hub</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--color-text-1)', marginTop: 6, fontWeight: 600 }}>
              AI Agent 统一管理台
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginTop: 3 }}>
              中央仓库一份配置，分发到 WorkBuddy / ZCode 各端 —— 数据全部保存在本机（~/.agenthub/），不外发
            </div>
          </div>
        </div>

        <div className="flex" style={{ gap: 8, marginTop: 18, flexWrap: 'wrap', position: 'relative' }}>
          {['一份配置 · 双端分发', '请求级用量 · 与账单同源', '先备份 · 失败自动回滚'].map((t) => (
            <span key={t} className="chip ok" style={{ fontSize: 10.5 }}>
              ✓ {t}
            </span>
          ))}
        </div>

        <div className="flex" style={{ gap: 8, marginTop: 16, flexWrap: 'wrap', position: 'relative' }}>
          <button className="btn p" onClick={() => setActive('dashboard')}>
            ▦ 进入用量总览
          </button>
          <button className="btn gh" onClick={() => setActive('accounts')}>
            ⇄ 管理账号
          </button>
          <button className="btn gh" onClick={() => setActive('architecture')}>
            ⬡ 查看项目架构
          </button>
        </div>
      </div>

      {/* 五步上手 —— 新手引导核心，大号纵向步骤时间轴 */}
      <div
        className="card"
        style={{
          padding: '24px 26px', marginBottom: 16,
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 6%, var(--color-surface)) 0%, var(--color-surface) 40%)',
        }}
      >
        <div className="flex items-center" style={{ gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🚀</span>
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: 0.5 }}>五步上手</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-3)', marginTop: 2 }}>
              按顺序走完这五步，AgentHub 就完全就绪了 —— 点击任意步骤直达对应功能岛
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', marginTop: 16, paddingLeft: 6 }}>
          {/* 竖向连接线：贯穿所有步骤徽章 */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', left: 27, top: 26, bottom: 26, width: 2,
              background: 'color-mix(in srgb, var(--color-primary) 35%, transparent)',
            }}
          />
          {QUICK_STEPS.map((s, i) => (
            <div
              key={s.n}
              className="hover-zoom"
              style={{
                position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 16,
                padding: '12px 14px', marginBottom: i < QUICK_STEPS.length - 1 ? 10 : 0,
                borderRadius: 10, cursor: 'pointer',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              }}
              onClick={() => setActive(s.page)}
            >
              <span
                style={{
                  flex: 'none', width: 44, height: 44, borderRadius: '50%', fontSize: 19, fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 55%, #0a7a4d))',
                  color: '#fff', boxShadow: '0 2px 10px color-mix(in srgb, var(--color-primary) 35%, transparent)',
                }}
              >
                {s.n}
              </span>
              <div style={{ minWidth: 0, paddingTop: 1 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800 }}>
                  {s.t}
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-2)', marginLeft: 10 }}>{s.d}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-3)', marginTop: 4, lineHeight: 1.6 }}>{s.tip}</div>
              </div>
              <span style={{ marginLeft: 'auto', flex: 'none', color: 'var(--color-text-3)', fontSize: 14, alignSelf: 'center' }}>›</span>
            </div>
          ))}
        </div>
      </div>

      {/* 8 岛速览（点击跳转） */}
      <b style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>🧭 功能岛速览（点击卡片直接前往）</b>
      <div className="grid grid-cols-2 gap-2.5" style={{ marginBottom: 14 }}>
        {ISLANDS.map((it) => (
          <div
            key={it.page}
            className="card hover-zoom"
            style={{ padding: '12px 14px', cursor: 'pointer' }}
            onClick={() => setActive(it.page)}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 16, color: 'var(--color-primary)' }}>{it.icon}</span>
              <b style={{ fontSize: 12.5 }}>{it.name}</b>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-2)', marginTop: 6, lineHeight: 1.6 }}>{it.desc}</div>
          </div>
        ))}
      </div>

      {/* 安全与常识 */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <b style={{ fontSize: 13 }}>🛡️ 安全红线（了解即可，无需配置）</b>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', marginTop: 8, lineHeight: 1.9 }}>
          · 所有写操作：先备份（~/.agenthub/backups/）→ 原子写 → 校验 → 失败自动回滚；<br />
          · 登录态文件只做文件级复制、永不读取内容；API Key 只存目标文件不入库；对话正文永不入库；<br />
          · 关闭按钮默认最小化到托盘（可在设置更改）；顶栏版本号点击可检查更新。
        </div>
      </div>
    </div>
  );
}
