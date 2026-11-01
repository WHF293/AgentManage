import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  wbCreditByAccount,
  wbCreditSetTotal,
  wbCreditSummary,
  wbDeleteSlot,
  wbImportLegacy,
  wbOverview,
  wbRenameSlot,
  wbSaveSlot,
  wbSwitch,
  zcodeDeleteSlot,
  zcodeLaunch,
  zcodeOverview,
  zcodeQuota,
  zcodeRenameSlot,
  zcodeSaveSlot,
  zcodeSwitch,
  type SwitchReport,
  type WbAccountCredit,
  type WbCreditSummary,
  type WbOverview,
  type ZcodeAccountOverview,
  type ZcodeQuota,
  type ZcodeSwitchReport,
} from '../api';
import { PageHeader } from '../common/components/PageHeader';
import { ConfirmDialog, InputDialog } from '../common/components/ConfirmDialog';
import { toast } from '../stores/ui';
import { ArchHelp } from '../common/components/ArchHelp';
import accountArch from '../assets/arch/account.svg';

const mask = (s: string) => (s.length > 8 ? `${s.slice(0, 6)}…` : s || '—');

type WbConfirmState =
  | { kind: 'switch'; slotId: string; label: string }
  | { kind: 'delete'; slotId: string; label: string }
  | null;
type ZcConfirmState = { kind: 'switch' | 'delete'; slotId: string; label: string } | null;

const pctColor = (pct: number) =>
  pct > 80 ? 'var(--color-danger)' : pct > 50 ? 'var(--color-warn, #d9a441)' : 'var(--color-primary)';

const fmtInt = (n: number) => Math.round(n).toLocaleString();

/** 额度条（ZCode 五小时/周窗口共用） */
function QuotaBar({ label, w }: { label: string; w: ZcodeQuota['h5'] }) {
  const pct = Math.min(100, Math.max(0, w.used_pct));
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="flex items-center" style={{ gap: 8 }}>
        <b style={{ fontSize: 12, color: 'var(--color-text-2)', flex: 'none' }}>{label}</b>
        <span
          style={{
            fontSize: 12,
            fontWeight: 800,
            fontFamily: 'Consolas, monospace',
            color: pctColor(pct),
          }}
        >
          {pct}%
        </span>
        <span style={{ flex: 1 }}>
          <span className="bar">
            <i style={{ width: `${pct}%`, background: pctColor(pct) }} />
          </span>
        </span>
        <span style={{ fontSize: 10.5, color: 'var(--color-text-3)', flex: 'none' }}>
          {w.used.toLocaleString()} / {w.total.toLocaleString()} 分
          {w.reset_at && <> · 重置 {w.reset_at}</>}
        </span>
      </div>
    </div>
  );
}

/**
 * 折叠动画容器：grid-template-rows 0fr↔1fr 过渡（高度平滑收放）。
 * 包裹整个槽位卡片网格 —— 收起时分组只保留状态条与操作按钮。
 */
function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={!open}
      style={{
        gridColumn: '1/3',
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.35s ease',
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            paddingTop: open ? 10 : 0,
            opacity: open ? 1 : 0,
            transition: 'padding-top 0.35s ease, opacity 0.25s ease',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Account 岛 —— WorkBuddy / ZCode 双分组：槽位切换 + WB 剩余积分 + ZCode 官方额度 */
export function AccountsPage() {
  // ── WorkBuddy ──
  const [data, setData] = useState<WbOverview | null>(null);
  const [report, setReport] = useState<SwitchReport | null>(null);
  const [credit, setCredit] = useState<WbCreditSummary | null>(null);
  // 按账户（uid）积分用量：WB 槽位卡片【当日使用 / 账户剩余】
  const [creditAcct, setCreditAcct] = useState<WbAccountCredit[]>([]);
  const [confirm, setConfirm] = useState<WbConfirmState>(null);
  const [naming, setNaming] = useState(false);
  const [editingTotal, setEditingTotal] = useState(false);

  // ── ZCode ──
  const [zc, setZc] = useState<ZcodeAccountOverview | null>(null);
  const [zcReport, setZcReport] = useState<ZcodeSwitchReport | null>(null);
  const [zcQuotaData, setZcQuotaData] = useState<ZcodeQuota | null>(null);
  const [zcQuotaErr, setZcQuotaErr] = useState<string | null>(null);
  const [zcQuotaLoading, setZcQuotaLoading] = useState(false);
  const [zcConfirm, setZcConfirm] = useState<ZcConfirmState>(null);
  const [zcNaming, setZcNaming] = useState(false);
  // 分组展开/收起：收起只显示当前生效账户（>1 个槽位时才出现开关）
  const [wbOpen, setWbOpen] = useState(true);
  const [zcOpen, setZcOpen] = useState(true);
  // 槽位改名：agent = 目标分组，slotId + 当前名（预填输入框）
  const [renaming, setRenaming] = useState<
    { agent: 'wb' | 'zc'; slotId: string; label: string } | null
  >(null);

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<WbOverview | null> => {
    setError(null);
    try {
      const d = await wbOverview();
      setData(d);
      return d;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  const refreshCredit = useCallback(async () => {
    try {
      setCredit(await wbCreditSummary());
      setCreditAcct(await wbCreditByAccount());
    } catch {
      /* 浏览器预览等场景忽略 */
    }
  }, []);

  const refreshZc = useCallback(async () => {
    try {
      setZc(await zcodeOverview());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshZcQuota = useCallback(async () => {
    setZcQuotaLoading(true);
    setZcQuotaErr(null);
    try {
      setZcQuotaData(await zcodeQuota());
    } catch (e) {
      setZcQuotaErr(String(e));
    } finally {
      setZcQuotaLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshCredit();
    void refreshZc();
    void refreshZcQuota();
    // WB 侧账号/进程可能随时变化（手动切号、启动退出），轮询保持实时
    const t = setInterval(() => {
      void refresh();
      void refreshCredit();
      void refreshZc();
    }, 10_000);
    return () => clearInterval(t);
  }, [refresh, refreshCredit, refreshZc, refreshZcQuota]);

  const manualRefresh = async () => {
    setRefreshing(true);
    const d = await refresh();
    await refreshCredit();
    await refreshZc();
    setRefreshing(false);
    if (d) toast('账号状态已刷新');
    else toast('刷新失败', 'err');
  };

  // ── WB 槽位操作 ──
  const doSaveCurrent = async (label: string) => {
    setBusy(true);
    try {
      await wbSaveSlot(label);
      setMessage(`已保存当前登录为「${label}」`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doSwitch = async (slotId: string, label: string, confirmKill: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await wbSwitch(slotId, confirmKill);
      setReport(r);
      if (r.ok) {
        const killed = confirmKill;
        setMessage(`已切换到「${label}」${killed ? '（WorkBuddy 已关闭并重启）' : ''}`);
        toast(`已切换到「${label}」${killed ? '，WorkBuddy 已重启' : ''}`);
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (slotId: string, label: string) => {
    if (data?.process_running) {
      setConfirm({ kind: 'switch', slotId, label });
      return;
    }
    void doSwitch(slotId, label, false);
  };

  const importLegacy = async () => {
    setBusy(true);
    try {
      const n = await wbImportLegacy();
      setMessage(n > 0 ? `从 ~/.workbuddy-launcher 导入 ${n} 个槽位` : '没有可导入的旧槽位');
      toast(n > 0 ? `导入 ${n} 个旧槽位` : '没有可导入的旧槽位');
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveTotal = async (v: { total?: string }) => {
    setEditingTotal(false);
    const n = Number((v.total ?? '').trim());
    if (!Number.isFinite(n)) return;
    try {
      await wbCreditSetTotal(n);
      toast(n > 0 ? `已设每月积分总额 ${n.toLocaleString()}` : '已清除总额度');
      await refreshCredit();
    } catch (e) {
      setError(String(e));
    }
  };

  // ── ZCode 槽位操作 ──
  const zcDoSave = async (label: string) => {
    setBusy(true);
    try {
      await zcodeSaveSlot(label);
      setMessage(`ZCode 槽位「${label}」已保存`);
      toast(`ZCode 槽位「${label}」已保存`);
      await refreshZc();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const zcDoSwitch = async (slotId: string, label: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await zcodeSwitch(slotId);
      setZcReport(r);
      if (r.ok) {
        setMessage(`已切换到「${label}」，下次启动 ZCode 生效`);
        toast(`已切换到「${label}」`);
      }
      await refreshZc();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const zcLaunch = async () => {
    try {
      await zcodeLaunch();
      toast('ZCode 已启动');
    } catch (e) {
      toast(String(e), 'err');
    }
    await refreshZc();
  };

  const wbSlots = data?.slots ?? [];
  const zcSlots = zc?.slots ?? [];

  /** 槽位改名（WB / ZCode 共用） */
  const doRename = async (
    t: { agent: 'wb' | 'zc'; slotId: string; label: string },
    label: string,
  ) => {
    setBusy(true);
    try {
      if (t.agent === 'wb') await wbRenameSlot(t.slotId, label);
      else await zcodeRenameSlot(t.slotId, label);
      toast(`已改名为「${label}」`);
      await refresh();
      await refreshZc();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  /** WB 槽位卡片（当前生效 = uid 与当前登录态一致，绿色主题） */
  const wbCard = (s: (typeof wbSlots)[number]) => {
    const isCurrent = data?.auth_found && s.uid && s.uid === data.current.uid;
    return (
      <div
        key={s.id}
        className="card hover-zoom"
        style={{
          padding: 14,
          border: isCurrent ? '1.5px solid var(--color-primary)' : undefined,
          background: isCurrent
            ? 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))'
            : undefined,
        }}
      >
        <div className="flex items-center justify-between">
          <b style={{ fontSize: 13 }}>{s.label}</b>
          {isCurrent ? (
            <span className="chip ok">当前生效</span>
          ) : (
            <span className="chip off">槽位 {s.id.startsWith('legacy-') ? '旧导入' : 'A/B'}</span>
          )}
        </div>
        <div style={{ color: 'var(--color-text-3)', fontSize: 11, margin: '6px 0' }}>
          uid {mask(s.uid)} · uin {mask(s.uin)} · 保存于 {s.saved_at}
          {!s.file_ok && <span style={{ color: 'var(--color-danger)' }}> · ⚠ 快照文件缺失</span>}
        </div>
        {/* 积分：当日使用 / 账户剩余（按 uid 从 usage_events.credit 聚合） */}
        {(() => {
          const c = creditAcct.find((x) => x.uid === s.uid);
          if (!c) return null;
          return (
            <div style={{ fontSize: 11, margin: '2px 0 6px', color: 'var(--color-text-2)' }}>
              当日使用积分{' '}
              <b style={{ fontFamily: 'Consolas, monospace' }}>{fmtInt(c.today_used)}</b>
              {credit && credit.monthly_total > 0 ? (
                <>
                  {' · '}账户剩余积分{' '}
                  <b
                    style={{
                      fontFamily: 'Consolas, monospace',
                      color:
                        credit.monthly_total > 0 && c.month_used / credit.monthly_total > 0.8
                          ? 'var(--color-danger)'
                          : 'var(--color-primary)',
                    }}
                  >
                    {fmtInt(c.remaining)}
                  </b>
                  <span style={{ color: 'var(--color-text-3)' }}>
                    {' '}/ {fmtInt(credit.monthly_total)}
                  </span>
                </>
              ) : (
                <span style={{ color: 'var(--color-text-3)' }}>
                  {' '}· 本月已用 {fmtInt(c.month_used)}（设总额度后显示剩余）
                </span>
              )}
            </div>
          );
        })()}
        <div className="flex" style={{ gap: 8 }}>
          {isCurrent ? (
            <span className="btn gh" style={{ opacity: 0.6, cursor: 'default' }}>当前账号</span>
          ) : (
            <button className="btn p" onClick={() => switchTo(s.id, s.label)} disabled={busy || !s.file_ok}>
              ⇄ 切换到此账号
            </button>
          )}
          <button
            className="btn gh"
            title={
              data?.process_running
                ? 'WorkBuddy 已在运行'
                : s.file_ok
                  ? '以该账号启动 WorkBuddy（若非当前登录态会先切换）'
                  : '槽位文件缺失'
            }
            onClick={() => void doSwitch(s.id, s.label, false)}
            disabled={busy || !s.file_ok || data?.process_running}
          >
            ▶ 启动
          </button>
          <button
            className="btn gh"
            title="修改槽位显示名称"
            onClick={() => setRenaming({ agent: 'wb', slotId: s.id, label: s.label })}
            disabled={busy}
          >
            ✎ 改名
          </button>
          <button className="btn gh" onClick={() => setConfirm({ kind: 'delete', slotId: s.id, label: s.label })} disabled={busy}>
            删除
          </button>
        </div>
      </div>
    );
  };

  /** ZCode 槽位卡片（当前生效 = 快照与当前登录态一致，蓝色主题） */
  const zcCard = (s: (typeof zcSlots)[number]) => {
    const isCurrent = s.active;
    return (
      <div
        key={s.id}
        className="card hover-zoom"
        style={{
          padding: 14,
          border: isCurrent ? '1.5px solid #4AA3DF' : undefined,
          background: isCurrent
            ? 'color-mix(in srgb, #4AA3DF 8%, var(--color-surface))'
            : undefined,
        }}
      >
        <div className="flex items-center justify-between">
          <b style={{ fontSize: 13 }}>{s.label}</b>
          {isCurrent ? (
            <span className="chip zc">当前生效</span>
          ) : (
            <span className="chip off">槽位</span>
          )}
        </div>
        <div style={{ color: 'var(--color-text-3)', fontSize: 11, margin: '6px 0' }}>
          保存于 {s.saved_at}
          {!s.file_ok && <span style={{ color: 'var(--color-danger)' }}> · ⚠ 快照文件缺失</span>}
        </div>
        {/* 额度完整信息：当前生效卡（Key 属于当前登录账号，其余槽位无从查询） */}
        {isCurrent && (
          <div style={{ margin: '4px 0 4px' }}>
            {zcQuotaData ? (
              <>
                {zcQuotaData.plan_level && (
                  <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', marginBottom: 4 }}>
                    套餐 {zcQuotaData.plan_level} · 官方接口实时数据
                  </div>
                )}
                <QuotaBar label="五小时额度" w={zcQuotaData.h5} />
                <QuotaBar label="周额度" w={zcQuotaData.week} />
              </>
            ) : zcQuotaLoading ? (
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '6px 0' }}>
                正在查询官方额度…
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', margin: '6px 0' }}>
                {zcQuotaErr ? `额度查询失败：${zcQuotaErr}` : '点「刷新额度」查询官方实时用量'}
              </div>
            )}
          </div>
        )}
        <div className="flex" style={{ gap: 8 }}>
          {isCurrent ? (
            <span className="btn gh" style={{ opacity: 0.6, cursor: 'default' }}>当前账号</span>
          ) : (
            <button
              className="btn p"
              title="恢复该槽位的 ZCode 登录态（下次启动 ZCode 生效）"
              onClick={() => setZcConfirm({ kind: 'switch', slotId: s.id, label: s.label })}
              disabled={busy || !s.file_ok}
            >
              ⇄ 切换到此账号
            </button>
          )}
          <button
            className="btn gh"
            title={zc?.running ? 'ZCode 已在运行' : '启动 ZCode 桌面（使用当前登录态）'}
            onClick={() => void zcLaunch()}
            disabled={busy || zc?.running}
          >
            ▶ 启动
          </button>
          <button
            className="btn gh"
            title="修改槽位显示名称"
            onClick={() => setRenaming({ agent: 'zc', slotId: s.id, label: s.label })}
            disabled={busy}
          >
            ✎ 改名
          </button>
          <button
            className="btn gh"
            onClick={() => setZcConfirm({ kind: 'delete', slotId: s.id, label: s.label })}
            disabled={busy}
          >
            删除
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={`账号（WorkBuddy ${wbSlots.length} · ZCode ${zcSlots.length} 槽位）`}
        sub="登录态只做文件级复制永不读内容 · WB 剩余积分 = 每月总额度 − 本月已用（与账单同源）· ZCode 额度走官方接口"
      />

      <div className="mb-3 flex items-center" style={{ gap: 8 }}>
        <span style={{ flex: 1 }} />
        {message && <span className="chip ok">{message}</span>}
        <button className="btn gh" onClick={manualRefresh} disabled={refreshing}>
          <span className={refreshing ? 'spinning' : ''} style={{ display: 'inline-block' }}>↻</span> 刷新
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

      {/* ═══ WorkBuddy 分组（操作按钮并入标题行） ═══ */}
      <div className="flex items-center" style={{ gap: 8, margin: '4px 0 8px', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13.5, color: 'var(--color-primary)' }}>WorkBuddy</b>
        <span className="chip ok">多账号槽位</span>
        <span style={{ flex: 1 }} />
        <button className="btn gh" onClick={importLegacy} disabled={busy}>⇪ 导入旧槽位</button>
        <button className="btn p" onClick={() => setNaming(true)} disabled={busy}>
          ⤓ 保存当前登录为槽位
        </button>
        <button className="btn gh" onClick={() => setEditingTotal(true)} disabled={busy}>
          {credit && credit.monthly_total > 0 ? '修改总额度' : '设置每月总额度'}
        </button>
        {wbSlots.length > 1 && (
          <span
            className="chip off"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setWbOpen((o) => !o)}
          >
            {wbOpen ? '收起 ▴' : `展开全部 ▾ · ${wbSlots.length} 槽位`}
          </span>
        )}
      </div>

      {/* WB 切换结果流程条 */}
      {report && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            borderColor: report.ok ? 'var(--color-ok)' : 'var(--color-danger)',
          }}
        >
          <b style={{ fontSize: 12, color: report.ok ? 'var(--color-ok)' : 'var(--color-danger)' }}>
            {report.ok ? '✓ WB 切换成功' : '✕ WB 切换失败（已自动回滚）'}
          </b>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
            {report.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
            {report.error && `\n错误：${report.error}`}
          </div>
        </div>
      )}

      {/* WB 槽位卡片：随展开/收起动画整体收放（收起只留分组状态条与操作按钮） */}
      <div className="grid grid-cols-2 gap-2.5" style={{ marginBottom: 20 }}>
        {wbSlots.length === 0 ? (
          <div
            className="card"
            style={{ padding: 18, color: 'var(--color-text-3)', fontSize: 12, gridColumn: '1/3' }}
          >
            还没有槽位 —— 登录 WB 后点「保存当前登录为槽位」，或点「导入旧槽位」从
            ~/.workbuddy-launcher 迁移。
          </div>
        ) : (
          <Collapse open={wbOpen}>{wbSlots.map((s) => wbCard(s))}</Collapse>
        )}
      </div>

      {/* 分组分隔线 */}
      <div style={{ borderTop: '1px solid var(--color-border)', margin: '2px 0 14px' }} />

      {/* ═══ ZCode 分组（操作按钮并入标题行） ═══ */}
      <div className="flex items-center" style={{ gap: 8, margin: '4px 0 8px', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13.5, color: '#4AA3DF' }}>ZCode</b>
        <span className="chip zc">快速切号</span>
        <span style={{ flex: 1 }} />
        <button className="btn gh" onClick={() => void refreshZcQuota()} disabled={zcQuotaLoading}>
          <span className={zcQuotaLoading ? 'spinning' : ''} style={{ display: 'inline-block' }}>↻</span> 刷新额度
        </button>
        <button className="btn p" onClick={() => setZcNaming(true)} disabled={busy}>
          ⤓ 保存当前登录为槽位
        </button>
        {zcSlots.length > 1 && (
          <span
            className="chip off"
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setZcOpen((o) => !o)}
          >
            {zcOpen ? '收起 ▴' : `展开全部 ▾ · ${zcSlots.length} 槽位`}
          </span>
        )}
      </div>

      {/* ZCode 切换结果流程条 */}
      {zcReport && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            borderColor: zcReport.ok ? '#4AA3DF' : 'var(--color-danger)',
          }}
        >
          <b style={{ fontSize: 12, color: zcReport.ok ? '#4AA3DF' : 'var(--color-danger)' }}>
            {zcReport.ok ? '✓ ZCode 切换成功' : '✕ ZCode 切换失败'}
          </b>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
            {zcReport.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
            {zcReport.error && `\n错误：${zcReport.error}`}
          </div>
        </div>
      )}

      {/* ZCode 槽位卡片：随展开/收起动画整体收放（收起只留分组状态条与操作按钮） */}
      <div className="grid grid-cols-2 gap-2.5">
        {zcSlots.length === 0 ? (
          <div
            className="card"
            style={{ padding: 18, color: 'var(--color-text-3)', fontSize: 12, gridColumn: '1/3' }}
          >
            还没有 ZCode 槽位 —— 登录 ZCode 后点「保存当前登录为槽位」。
          </div>
        ) : (
          <Collapse open={zcOpen}>{zcSlots.map((s) => zcCard(s))}</Collapse>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 10 }}>
        · 安全红线：登录态只做文件级复制永不读内容 · WB 切换 检测进程 →（运行中需确认后关闭）→
        备份 → 恢复 → 校验 → 重启，失败自动回滚 · ZCode 切换 备份 → 原子写入 → JSON 校验，失败回滚，
        下次启动 ZCode 生效 · 关闭 WB 必须经用户确认，绝不静默强杀
      </div>

      {/* ═══ 对话框 ═══ */}
      {confirm?.kind === 'switch' && (
        <ConfirmDialog
          title="切换账号"
          message={`检测到 WorkBuddy 正在运行。\n\n切换账户需要先主动关闭 WorkBuddy，AgentHub 会自动恢复「${confirm.label}」的登录态并重新启动 WorkBuddy。\n\n注意：WB 内未保存的工作将丢失，请先确认已保存。`}
          confirmLabel="关闭 WorkBuddy 并切换"
          danger
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            if (c) void doSwitch(c.slotId, c.label, true);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="删除槽位"
          message={`删除槽位「${confirm.label}」？\n槽位快照文件将一并删除（auth 登录态不受影响）。`}
          confirmLabel="删除"
          danger
          onConfirm={async () => {
            const c = confirm;
            setConfirm(null);
            try {
              await wbDeleteSlot(c.slotId);
              toast(`已删除槽位「${c.label}」`);
              await refresh();
            } catch (e) {
              setError(String(e));
            }
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {naming && (
        <InputDialog
          title="保存 WB 槽位"
          message="为当前 WB 登录态起个名字，便于在槽位列表中识别。"
          fields={[{ key: 'label', label: '槽位名称', placeholder: '如：微信号 / 流量卡号' }]}
          confirmLabel="保存"
          onConfirm={(v) => {
            const label = v.label?.trim();
            setNaming(false);
            if (label) void doSaveCurrent(label);
          }}
          onCancel={() => setNaming(false)}
        />
      )}
      {editingTotal && (
        <InputDialog
          title="每月积分总额度"
          message="填写 WB 账号的每月积分总额（如 10000）。剩余积分 = 总额度 − 本月已用（与官方账单同源）。填 0 清除。"
          fields={[{ key: 'total', label: '每月积分总额', placeholder: '如：10000' }]}
          confirmLabel="保存"
          onConfirm={(v) => void saveTotal(v)}
          onCancel={() => setEditingTotal(false)}
        />
      )}
      {zcConfirm && (
        <ConfirmDialog
          title={zcConfirm.kind === 'switch' ? '切换 ZCode 账号' : '删除 ZCode 槽位'}
          message={
            zcConfirm.kind === 'switch'
              ? `恢复「${zcConfirm.label}」的 ZCode 登录态？\n\n当前登录态会先备份，失败自动回滚。切换后下次启动 ZCode 生效（正在运行的 ZCode 会话不受影响）。`
              : `删除 ZCode 槽位「${zcConfirm.label}」？\n槽位快照文件将一并删除（当前登录态不受影响）。`
          }
          confirmLabel={zcConfirm.kind === 'switch' ? '恢复槽位' : '删除'}
          danger={zcConfirm.kind === 'delete'}
          onConfirm={async () => {
            const c = zcConfirm;
            setZcConfirm(null);
            if (!c) return;
            if (c.kind === 'switch') await zcDoSwitch(c.slotId, c.label);
            else {
              try {
                await zcodeDeleteSlot(c.slotId);
                toast(`已删除槽位「${c.label}」`);
                await refreshZc();
              } catch (e) {
                setError(String(e));
              }
            }
          }}
          onCancel={() => setZcConfirm(null)}
        />
      )}
      {zcNaming && (
        <InputDialog
          title="保存 ZCode 槽位"
          message="为当前 ZCode 登录态（~/.zcode/v2/credentials.json）起个名字。"
          fields={[{ key: 'label', label: '槽位名称', placeholder: '如：主号 / 小号' }]}
          confirmLabel="保存"
          onConfirm={(v) => {
            const label = v.label?.trim();
            setZcNaming(false);
            if (label) void zcDoSave(label);
          }}
          onCancel={() => setZcNaming(false)}
        />
      )}
      {renaming && (
        <InputDialog
          title="槽位改名"
          message={`将槽位「${renaming.label}」改名为：`}
          fields={[
            {
              key: 'label',
              label: '新名称',
              defaultValue: renaming.label,
              placeholder: '如：微信号 / 流量卡号',
            },
          ]}
          confirmLabel="保存"
          onConfirm={(v) => {
            const t = renaming;
            setRenaming(null);
            const label = v.label?.trim();
            if (t && label && label !== t.label) void doRename(t, label);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
      <ArchHelp
        title="Account 岛架构"
        desc="双 Agent 槽位化：登录态只做文件级复制永不读内容；WB 走 检测→备份→原子替换→校验→启动，失败自动回滚最近备份；ZCode 备份→原子写入→JSON 校验，下次启动生效。WB 剩余积分 = 每月总额度 − 本月已用（账单同源）；ZCode 五小时/周额度走 bigmodel 官方接口（读 ZCode 配置中的 Coding Plan Key）。"
        img={accountArch}
      />
    </div>
  );
}
