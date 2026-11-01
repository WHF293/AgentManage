import { useCallback, useState } from 'react';
import overallArch from '../assets/arch/overall.svg';
import pluginArch from '../assets/arch/plugin.svg';
import skillsArch from '../assets/arch/skills.svg';
import mcpArch from '../assets/arch/mcp.svg';
import accountArch from '../assets/arch/account.svg';
import modelsArch from '../assets/arch/models.svg';
import memoryArch from '../assets/arch/memory.svg';

interface ArchSection {
  id: string;
  title: string;
  desc: string;
  img: string;
}

/** 架构总览：项目整体 → 插件体系 → 各功能岛（原各页「?」固钉内容集中于此） */
const SECTIONS: ArchSection[] = [
  {
    id: 'overall',
    title: '项目总架构',
    desc: 'React 9 岛 ⇄ Tauri 2 IPC ⇄ Rust 核心层（plugins 门控 × store 单一事实源 × adapters 适配器抽象）⇄ 共享引擎 ⇄ 中央仓库 ~/.agenthub 与各端文件。所有引擎注册表驱动、agent 无关；所有写路径备份 + 原子写 + 失败回滚。',
    img: overallArch,
  },
  {
    id: 'plugin',
    title: 'Plugin 架构（可插拔适配器）',
    desc: '每个 agent 适配器 = 一个插件。首次启动按本机安装自动启用（auto），之后一切以用户手动开关为准并持久化（manual）；enabled_adapters 门控传播到全部引擎与各岛（停用即读放行、写拒绝、UI 置灰）。社区新增 agent 三步接入，引擎零改动。',
    img: pluginArch,
  },
  {
    id: 'skills',
    title: 'Skills 岛架构',
    desc: '中央仓库 ~/.agenthub/skills 单一事实源；各启用插件按适配器声明策略分发（逐项链 / 整目录链）；软链三级降级 symlink→junction→copy，替换实目录前自动备份。',
    img: skillsArch,
  },
  {
    id: 'mcp',
    title: 'MCP 岛架构',
    desc: '统一定义存 SQLite mcp_servers（按 agent 的启用态 JSON）；各启用插件端由适配器完成格式翻译与合并式写入（仅覆盖托管容器，timeout/headers 等原样保留）。新增 agent 适配器零改动接入。',
    img: mcpArch,
  },
  {
    id: 'account',
    title: 'Account 岛架构',
    desc: '多 Agent 槽位化：登录态只做文件级复制永不读内容；WB 走 检测→备份→原子替换→校验→启动，失败自动回滚最近备份；ZCode 备份→原子写入→JSON 校验，下次启动生效。WB 剩余积分 = 每月总额度 − 本月已用（账单同源）；ZCode 五小时/周额度走 bigmodel 官方接口（读 ZCode 配置中的 Coding Plan Key）。插件停用：分组置灰仅展示、切换/启动等全部拒绝。',
    img: accountArch,
  },
  {
    id: 'models',
    title: 'Model 岛架构',
    desc: 'ZCode v2/config.json 直写 + WB models.json 写穿（1s debounce 热加载）；/v1/models 四级候选链逐级降级；API Key 只存目标文件，永不入库。ZCode 是主存储，其插件停用时整岛置灰空态。',
    img: modelsArch,
  },
  {
    id: 'memory',
    title: 'Memory 岛架构',
    desc: '全局记忆统一真身 ~/.agenthub/MEMORY.md，各启用端以文件符号链接共写；项目记忆 .ai/ 桥接：init 注入标记块 / sync FNV 指纹漂移检测 / consolidate 蒸馏。统一与写入均只对已启用插件生效。',
    img: memoryArch,
  },
];

const shortTitle = (t: string) => t.replace(' 架构', '').replace('（可插拔适配器）', '').replace('（插件体系）', '');

/** 左右翻页圆钮 */
function NavButton({
  dir,
  onClick,
  disabled,
}: {
  dir: 'prev' | 'next';
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      className="btn gh"
      aria-label={dir === 'prev' ? '上一张' : '下一张'}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        borderRadius: '50%',
        fontSize: 17,
        padding: 0,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {dir === 'prev' ? '‹' : '›'}
    </button>
  );
}

/** Architecture 岛 —— 架构图横向轮播（不自动播放；目录点击直达，左右按钮翻页） */
export function ArchitecturePage() {
  const [index, setIndex] = useState(0);
  const total = SECTIONS.length;
  const cur = SECTIONS[index];

  const go = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(total - 1, i)));
  }, [total]);

  return (
    <div>
      <div
        className="flex items-center justify-between"
        style={{ margin: '-16px -20px 12px', padding: '0 20px 10px' }}
      >
        <b style={{ fontSize: 15 }}>Architecture · 架构总览</b>
        <span className="chip off" style={{ userSelect: 'none' }}>
          {index + 1} / {total}
        </span>
      </div>

      {/* 目录：点击直达对应卡片 */}
      <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 14 }}>
        {SECTIONS.map((s, i) => (
          <span
            key={s.id}
            className={`chip ${i === index ? 'ok' : 'off'}`}
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => go(i)}
          >
            {shortTitle(s.title)}
          </span>
        ))}
      </div>

      {/* 横向轮播：左按钮 · 视口 · 右按钮 */}
      <div className="flex items-stretch" style={{ gap: 10 }}>
        <div className="flex items-center">
          <NavButton dir="prev" onClick={() => go(index - 1)} disabled={index === 0} />
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {/* 轨道：translateX 切换，无自动播放 */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              transform: `translateX(-${index * 100}%)`,
              transition: 'transform .35s ease',
            }}
          >
            {SECTIONS.map((s) => (
              <div key={s.id} style={{ flex: '0 0 100%', minWidth: 0, padding: '0 2px' }}>
                <div className="card" style={{ padding: 18 }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                    <b style={{ fontSize: 14 }}>{s.title}</b>
                    <span className="chip off" style={{ userSelect: 'none' }}>
                      {shortTitle(s.title)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--color-text-2)',
                      lineHeight: 1.7,
                      marginBottom: 12,
                    }}
                  >
                    {s.desc}
                  </div>
                  <div
                    className="card"
                    style={{ padding: 0, overflow: 'hidden', background: '#ffffff' }}
                  >
                    <img src={s.img} alt={s.title} style={{ width: '100%', display: 'block' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center">
          <NavButton dir="next" onClick={() => go(index + 1)} disabled={index === total - 1} />
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 10, textAlign: 'center' }}>
        当前：{cur.title} · 架构图源文件在 src/assets/arch/*.svg，随代码一同维护 · 社区适配器接入指南见 Plugin 架构与 AGENTS.md
      </div>
    </div>
  );
}
