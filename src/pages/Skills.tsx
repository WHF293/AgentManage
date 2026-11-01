import { useCallback, useEffect, useState } from 'react';
import {
  getAppStatus,
  marketInstall,
  marketRefresh,
  relinkSkill,
  runSkillsMigration,
  setSkillEnabled,
  skillDelete,
  skillsOverview,
  zcodePluginSkills,
  type AppStatus,
  type LinkStatus,
  type MarketCatalog,
  type MarketSkill,
  type PluginSkillItem,
  type MigrateReport,
  type SkillOverviewItem,
} from '../api';
import { agentChipClass } from '../agents';
import { PageHeader } from '../common/components/PageHeader';
import { ConfirmDialog } from '../common/components/ConfirmDialog';
import { ArchHelp } from '../common/components/ArchHelp';
import skillsArch from '../assets/arch/skills.svg';

type SkillView = 'installed' | 'missing' | 'all';

const STATUS_LABEL: Record<LinkStatus, string> = {
  linked: '✓ 已分发',
  diverged: '实目录（未接管）',
  broken: '断链 ✕',
  missing: '未分发',
};

const STATUS_CHIP: Record<LinkStatus, string> = {
  linked: 'ok',
  diverged: 'warn',
  broken: 'err',
  missing: 'off',
};

function StatusChip({
  label,
  status,
  onClick,
  title,
  agent,
}: {
  label: string;
  status: LinkStatus;
  onClick?: () => void;
  title?: string;
  /** agent id：正常态用身份色（异常态保留 warn/err 状态色优先） */
  agent?: string;
}) {
  const cls = status === 'linked' && agent ? agentChipClass(agent) : STATUS_CHIP[status];
  return (
    <span
      className={`chip ${cls}`}
      style={onClick ? { cursor: 'pointer' } : undefined}
      title={title}
      onClick={onClick}
    >
      {label}
    </span>
  );
}

/** 迁移结果弹层（M1 报告，按启用插件端分行展示） */
function MigrationReportModal({ report, onClose }: { report: MigrateReport; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.25)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 520, maxHeight: '76vh', overflow: 'auto', cursor: 'default' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <b>迁移完成</b>
          <span
            style={{ color: 'var(--color-text-3)', cursor: 'pointer' }}
            onClick={onClose}
          >
            ✕
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-3)', margin: '4px 0 10px' }}>
          中央仓库 {report.central_dir} · 链接策略 {report.link_mode} · 导入 {report.imported.length} 个
        </div>
        {report.agents.map((a) => (
          <div key={a.agent} style={{ fontSize: 11.5, color: 'var(--color-text-2)', margin: '2px 0' }}>
            <b style={{ color: 'var(--color-text-1)' }}>{a.display_name}</b> · {a.action}
            {a.failed.length > 0 && (
              <span style={{ color: 'var(--color-danger)' }}> · 失败 {a.failed.length}</span>
            )}
          </div>
        ))}
        {report.imported.length > 0 && (
          <div className="list" style={{ marginBottom: 10, marginTop: 8 }}>
            {report.imported.map((s) => (
              <div className="li" key={s.name} style={{ padding: '7px 12px' }}>
                <div className="grow">
                  <div className="nm" style={{ fontSize: 12 }}>{s.name}</div>
                  <div className="ds">来源 {s.from} · 采用 {s.took}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {(report.import_warnings.length > 0 || report.warnings.length > 0) && (
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--color-warn)',
              background: 'color-mix(in srgb, var(--color-warn) 8%, transparent)',
              borderRadius: 10,
              padding: '8px 12px',
              whiteSpace: 'pre-wrap',
            }}
          >
            {[...report.import_warnings, ...report.warnings].join('\n')}
          </div>
        )}
      </div>
    </div>
  );
}

/** M7 市场技能卡片网格（仅展示未安装项；来源内置 Claude 官方市场） */
function MarketGrid({
  skills,
  keyword,
  onInstall,
  installing,
}: {
  skills: MarketSkill[];
  keyword: string;
  onInstall: (name: string) => void;
  installing: string | null;
}) {
  const shown = skills.filter(
    (s) =>
      !keyword ||
      s.name.toLowerCase().includes(keyword.toLowerCase()) ||
      s.description.toLowerCase().includes(keyword.toLowerCase()),
  );
  if (shown.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-3)', padding: '8px 2px' }}>
        {skills.length === 0 ? '市场目录为空，点「巡检」刷新' : '没有匹配的市场技能'}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {shown.map((s) => (
        <div className="card" key={s.name} style={{ padding: 12 }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <b style={{ fontSize: 12 }}>{s.name}</b>
            <span className="chip off">{s.source_name}</span>
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--color-text-3)',
              margin: '4px 0 8px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              minHeight: 32,
            }}
            title={s.description}
          >
            {s.description || '—'}
          </div>
          <div className="flex items-center" style={{ gap: 6 }}>
            <button className="btn p" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => onInstall(s.name)} disabled={installing !== null}>
              {installing === s.name ? '安装中…' : '⊕ 安装'}
            </button>
            <span className="chip off">未安装</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** M2+M7 Skills 岛 —— 已安装列表 / 未安装市场 / 全部，三视图切换 */
export function SkillsPage() {
  const [items, setItems] = useState<SkillOverviewItem[] | null>(null);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [linkMode, setLinkMode] = useState<'auto' | 'symlink' | 'junction' | 'copy'>('auto');
  const [migrating, setMigrating] = useState(false);
  const [report, setReport] = useState<MigrateReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [view, setView] = useState<SkillView>('installed');
  const [market, setMarket] = useState<MarketCatalog | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SkillOverviewItem | null>(null);
  const [pluginSkills, setPluginSkills] = useState<PluginSkillItem[]>([]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [list, st] = await Promise.all([skillsOverview(), getAppStatus()]);
      setItems(list);
      setStatus(st);
      // 插件技能只读全貌（旧后端无此命令时静默降级）
      void zcodePluginSkills().then(setPluginSkills).catch(() => setPluginSkills([]));
      return list;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  const loadMarket = useCallback(async () => {
    setError(null);
    try {
      setMarket(await marketRefresh());
    } catch (e) {
      setError(`市场刷新失败：${e}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 切到「未安装 / 全部」时懒加载市场目录
  useEffect(() => {
    if (view !== 'installed' && market === null) void loadMarket();
  }, [view, market, loadMarket]);

  const runMigration = async () => {
    setMigrating(true);
    setError(null);
    try {
      const r = await runSkillsMigration(linkMode === 'auto' ? undefined : linkMode);
      setReport(r);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setMigrating(false);
    }
  };

  const fixOne = async (name: string, agent: string) => {
    setError(null);
    try {
      await relinkSkill(name, agent);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const doDelete = async (name: string) => {
    setError(null);
    try {
      await skillDelete(name);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const distributeAll = async () => {
    if (!items) return;
    setMigrating(true);
    setError(null);
    const fails: string[] = [];
    for (const item of items) {
      for (const st of item.agents) {
        if (st.whole_link || st.status === 'linked') continue;
        try {
          await relinkSkill(item.name, st.agent);
        } catch (e) {
          fails.push(`${st.display_name}/${item.name}: ${e}`);
        }
      }
    }
    if (fails.length > 0) setError(`部分分发失败：\n${fails.join('\n')}`);
    await refresh();
    setMigrating(false);
  };

  const toggleEnabled = async (name: string, enabled: boolean) => {
    try {
      const msg = await setSkillEnabled(name, enabled);
      setMessage(msg);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const filtered = (items ?? []).filter((s) =>
    keyword ? s.name.toLowerCase().includes(keyword.toLowerCase()) : true,
  );
  const marketMissing = (market?.skills ?? []).filter(
    (s) =>
      !s.installed &&
      (!keyword ||
        s.name.toLowerCase().includes(keyword.toLowerCase()) ||
        s.description.toLowerCase().includes(keyword.toLowerCase())),
  );
  const sourceCounts = new Map<string, { name: string; total: number; missing: number }>();
  for (const s of market?.skills ?? []) {
    const cur = sourceCounts.get(s.source) ?? { name: s.source_name, total: 0, missing: 0 };
    cur.total += 1;
    if (!s.installed) cur.missing += 1;
    sourceCounts.set(s.source, cur);
  }

  const installOne = async (name: string) => {
    setInstalling(name);
    setError(null);
    setMessage(null);
    try {
      const updated = await marketInstall(name);
      setMarket(updated);
      await refresh();
      setMessage(`已安装「${name}」→ 中央仓库 → 分发到已启用插件`);
    } catch (e) {
      setError(`安装失败：${e}`);
    } finally {
      setInstalling(null);
    }
  };

  const centralEmpty = (status?.central_skills_count ?? 0) === 0;
  const pendingCount = (items ?? []).filter((s) =>
    s.agents.some((st) => !st.whole_link && st.status !== 'linked'),
  ).length;

  return (
    <div>
      <PageHeader
        title={`Skills（${items?.length ?? '…'}）`}
        sub={`中央仓库 ~/.agenthub/skills · 链接策略 ${status?.link_mode ?? '…'} · 仅对 Plugin 岛已启用的适配器分发`}
      />

      {/* M1 迁移向导（中央仓库为空时显示） */}
      {centralEmpty && (
        <div className="card" style={{ padding: 16, marginBottom: 12, borderColor: 'var(--color-primary)' }}>
          <div className="flex items-center justify-between">
            <div>
              <b style={{ fontSize: 13 }}>首次迁移</b>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', marginTop: 2 }}>
                从 WorkBuddy 与 ZCode 现有 skills 目录并集导入中央仓库（双端并存取更新者），
                然后 WB 逐项链、ZCode 整目录链。被替换的实目录自动备份到 ~/.agenthub/backups/。
              </div>
            </div>
            <div className="flex items-center" style={{ gap: 8, flex: 'none' }}>
              <select
                value={linkMode}
                onChange={(e) => setLinkMode(e.target.value as typeof linkMode)}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  padding: '6px 8px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-1)',
                  fontSize: 12,
                }}
              >
                <option value="auto">自动探测链接策略</option>
                <option value="symlink">symlink（需开发者模式）</option>
                <option value="junction">junction（免特权）</option>
                <option value="copy">copy + 回写兜底</option>
              </select>
              <button className="btn p" onClick={runMigration} disabled={migrating}>
                {migrating ? '迁移中…' : '⇉ 一键迁移'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 工具条：搜索 + 视图切换（已安装/未安装/全部） */}
      <div className="mb-3 flex items-center" style={{ gap: 8 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="⌕ 搜索 skill…"
          style={{
            flex: 'none',
            width: 180,
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: '6px 10px',
            background: 'var(--color-surface)',
            color: 'var(--color-text-1)',
            fontSize: 12,
            outline: 'none',
          }}
        />
        {(
          [
            ['installed', `已安装（${items?.length ?? '…'}）`],
            ['missing', `未安装${market ? `（${market.skills.filter((s) => !s.installed).length}）` : ''}`],
            ['all', '全部'],
          ] as [SkillView, string][]
        ).map(([v, label]) => (
          <span
            key={v}
            className={`chip ${view === v ? 'ok' : 'off'}`}
            style={{ cursor: 'pointer', fontSize: 11.5, padding: '4px 12px' }}
            onClick={() => setView(v)}
          >
            {label}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        {message && <span className="chip ok">{message}</span>}
        {pendingCount > 0 && (
          <span className="chip warn">{pendingCount} 项待分发</span>
        )}
        <button
          className="btn gh"
          onClick={() => {
            void refresh();
            if (view !== 'installed') void loadMarket();
          }}
        >
          ↻ 巡检
        </button>
        <button className="btn p" onClick={distributeAll} disabled={migrating || !items?.length}>
          ⇉ 全部分发到已启用插件
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

      {/* 已安装列表（已安装 / 全部 视图） */}
      {view !== 'missing' &&
        (items === null ? (
          <div className="card" style={{ color: 'var(--color-text-3)' }}>加载中…</div>
        ) : filtered.length === 0 ? (
          <div
            className="card flex flex-col items-center"
            style={{ minHeight: 200, justifyContent: 'center', gap: 8, color: 'var(--color-text-3)' }}
          >
            <div style={{ fontWeight: 700 }}>中央仓库为空</div>
            <div style={{ fontSize: 12 }}>切到「未安装」从市场安装，或用「一键迁移」从双端导入</div>
          </div>
        ) : (
        <div className="item-grid">
          {filtered.map((item) => (
            <div className="item-card sm" key={item.name}>
              <div className="card-top">
                <span
                  className={`sw${item.enabled ? ' on' : ''}`}
                  title={
                    item.enabled
                      ? '已启用（点击禁用；同步 WB 自动调用 = 开）'
                      : '已禁用（点击启用；同步 WB 自动调用 = 关）'
                  }
                  onClick={() => toggleEnabled(item.name, !item.enabled)}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </div>
                </div>
                {item.source && (
                  <span className="chip off" style={{ flex: 'none' }}>
                    {item.source}
                    {item.source_ref ? ` · ${item.source_ref}` : ''}
                  </span>
                )}
              </div>
              <div
                className="ds desc-clamp"
                style={{ flex: 1, minHeight: 0 }}
                title={item.description ?? undefined}
              >
                {item.description ?? '—'}
              </div>
              <div className="card-actions">
                {item.agents.map((st) => {
                  return st.whole_link ? (
                    <span
                      key={st.agent}
                      className={`chip ${agentChipClass(st.agent)}`}
                      title={`${st.display_name} 处于整目录链模式，随中央仓库生效`}
                    >
                      {st.display_name} ✓ 整链
                    </span>
                  ) : (
                    <StatusChip
                      key={st.agent}
                      label={`${st.display_name} ${STATUS_LABEL[st.status]}`}
                      status={st.status}
                      agent={st.agent}
                      title={
                        st.status === 'linked'
                          ? '软链已建：agent 内可见、可调用'
                          : '点击重建链接（指向中央仓库）'
                      }
                      onClick={st.status === 'linked' ? undefined : () => fixOne(item.name, st.agent)}
                    />
                  );
                })}
                {item.agents.some((st) => st.agent === 'workbuddy') && (
                  <span
                    className={`chip ${item.wb_auto === null ? 'off' : item.wb_auto ? 'ok' : 'warn'}`}
                    title={
                      item.wb_auto === null
                        ? 'WB 尚未收录该技能（在 WB 打开一次技能面板后即可同步开关）'
                        : item.wb_auto
                          ? 'WB 允许模型自动调用'
                          : 'WB 已禁止模型自动调用（WB 内仍可手动使用）'
                    }
                  >
                    WB 自动 {item.wb_auto === null ? '?' : item.wb_auto ? '✓' : '关'}
                  </span>
                )}
                <span className="chip err" style={{ cursor: 'pointer' }} onClick={() => setDeleting(item)}>
                  删除
                </span>
              </div>
            </div>
          ))}
        </div>
        ))}

      {/* ZCode 插件技能（只读全貌：插件体系不经中央仓库分发） */}
      {view !== 'missing' && pluginSkills.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
            <b style={{ fontSize: 13 }}>ZCode 插件技能（只读）</b>
            <span
              className="chip off"
              title="插件技能由 ZCode 插件运行时加载与启停，不经 AgentHub 中央仓库分发"
            >
              不参与分发
            </span>
            <span style={{ flex: 1 }} />
          </div>
          <div className="list">
            {pluginSkills
              .filter(
                (p) => !keyword || p.name.toLowerCase().includes(keyword.toLowerCase()),
              )
              .map((p) => (
                <div className="li" key={p.name}>
                  <div className="ic" style={{ fontSize: 12 }}>⌗</div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="nm" style={{ fontSize: 12 }}>
                      {p.name}
                      <span className="chip off" style={{ marginLeft: 6 }}>
                        {p.plugin} v{p.plugin_version}
                      </span>
                      <span
                        className={`chip ${p.plugin_enabled ? 'ok' : 'warn'}`}
                        style={{ marginLeft: 6 }}
                      >
                        {p.plugin_enabled ? '插件已启用' : '插件已停用'}
                      </span>
                    </div>
                    <div className="ds" title={p.description ?? undefined}>
                      {p.description ?? '—'}
                    </div>
                  </div>
                </div>
              ))}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', marginTop: 6 }}>
            · 来自 ~/.zcode/cli/plugins/（installed_plugins.json + 各插件 manifest）；增删与启停请在
            ZCode 插件管理中进行，AgentHub 仅展示全貌
          </div>
        </div>
      )}

      {/* Skill 市场（未安装 / 全部 视图） */}
      {view !== 'installed' && (
        <div style={{ marginTop: view === 'all' ? 16 : 0 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 13 }}>Skill 市场</b>
            {[...sourceCounts.entries()].map(([id, c]) => (
              <span key={id} className="chip off" title={`${c.name}：共 ${c.total} 个，未安装 ${c.missing} 个`}>
                {c.name} {c.total}（未装 {c.missing}）
              </span>
            ))}
            <span style={{ flex: 1 }} />
            {market === null && <span className="chip off">市场加载中…</span>}
          </div>
          {(market?.warnings.length ?? 0) > 0 && (
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--color-warn)',
                background: 'color-mix(in srgb, var(--color-warn) 8%, transparent)',
                borderRadius: 10,
                padding: '6px 12px',
                marginBottom: 8,
              }}
            >
              {market?.warnings.map((w, i) => (
                <div key={i}>⚠ {w}</div>
              ))}
            </div>
          )}
          <MarketGrid
            skills={marketMissing}
            keyword={keyword}
            onInstall={installOne}
            installing={installing}
          />
          <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', marginTop: 8 }}>
            内置市场：anthropics/skills · obra/superpowers · cexll/myclaude（GitHub 开源，SKILL.md 通用扫描）
            · 安装 = 缓存 → 中央仓库 → 自动分发双端
          </div>
        </div>
      )}

      {report && <MigrationReportModal report={report} onClose={() => setReport(null)} />}

      {deleting && (
        <ConfirmDialog
          title="删除 Skill"
          message={`删除「${deleting.name}」？\n各启用插件端的引用将一并移除，中央仓库源文件删除前自动备份。`}
          confirmLabel="删除"
          danger
          onConfirm={() => {
            const name = deleting.name;
            setDeleting(null);
            void doDelete(name);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
      <ArchHelp
        title="Skills 岛架构"
        desc="中央仓库 ~/.agenthub/skills 单一事实源；各启用插件按适配器声明策略分发（逐项链 / 整目录链）；软链三级降级 symlink→junction→copy，替换实目录前自动备份。"
        img={skillsArch}
      />
    </div>
  );
}
