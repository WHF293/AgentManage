import { useCallback, useEffect, useState } from 'react';
import {
  wbDeleteSlot,
  wbImportLegacy,
  wbOverview,
  wbSaveSlot,
  wbSwitch,
  type SwitchReport,
  type WbOverview,
} from '../api';
import { PageHeader } from '../common/components/PageHeader';
import { ConfirmDialog } from '../common/components/ConfirmDialog';
import { toast } from '../stores/ui';

const mask = (s: string) => (s.length > 8 ? `${s.slice(0, 6)}…` : s || '—');

type ConfirmState =
  | { kind: 'switch'; slotId: string; label: string }
  | { kind: 'delete'; slotId: string; label: string }
  | null;

/** M5 WB 账号岛 —— F1 槽位与切换流程（进程检测 → 备份 → 恢复 → 校验 → 启动 → 回滚） */
export function AccountsPage() {
  const [data, setData] = useState<WbOverview | null>(null);
  const [report, setReport] = useState<SwitchReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

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

  const manualRefresh = async () => {
    setRefreshing(true);
    const d = await refresh();
    setRefreshing(false);
    if (d) toast('账号状态已刷新');
    else toast('刷新失败', 'err');
  };

  useEffect(() => {
    void refresh();
    // WB 侧账号/进程可能随时变化（手动切号、启动退出），轮询保持实时
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  const saveCurrent = async () => {
    const label = prompt('槽位名称（如：微信号 / 流量卡号）：');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      await wbSaveSlot(label.trim());
      setMessage(`已保存当前登录为「${label.trim()}」`);
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

  const removeSlot = (slotId: string, label: string) => {
    setConfirm({ kind: 'delete', slotId, label });
  };

  const slots = data?.slots ?? [];

  return (
    <div>
      <PageHeader
        title={`WorkBuddy 账号（${slots.length} 个槽位）`}
        sub="切换前自动检测并等待 WorkBuddy 完全退出 · auth 文件只做文件级复制，永不读取内容"
      />

      {/* 当前账号状态条 */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <span className={`chip ${data?.auth_found ? 'ok' : 'err'}`}>
            {data?.auth_found ? '● 登录态已找到' : '○ 未找到登录态'}
          </span>
          {data?.auth_found && (
            <span style={{ fontSize: 12 }}>
              当前 uid <code style={{ fontFamily: 'Consolas, monospace' }}>{mask(data.current.uid)}</code>
              {data.current.uin && <> · uin {mask(data.current.uin)}</>}
              {data.current.nickname && <> · {data.current.nickname}</>}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className={`chip ${data?.process_running ? 'warn' : 'off'}`}>
            {data?.process_running ? 'WB 运行中' : 'WB 未运行'}
          </span>
        </div>
      </div>

      <div className="mb-3 flex items-center" style={{ gap: 8 }}>
        <span style={{ flex: 1 }} />
        {message && <span className="chip ok">{message}</span>}
        <button className="btn gh" onClick={manualRefresh} disabled={refreshing}>
          <span className={refreshing ? 'spinning' : ''} style={{ display: 'inline-block' }}>↻</span> 刷新
        </button>
        <button className="btn gh" onClick={importLegacy} disabled={busy}>⇪ 导入旧槽位</button>
        <button className="btn p" onClick={saveCurrent} disabled={busy}>⤓ 保存当前登录为槽位</button>
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

      {/* 切换结果流程条 */}
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
            {report.ok ? '✓ 切换成功' : '✕ 切换失败（已自动回滚）'}
          </b>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-2)', marginTop: 6, whiteSpace: 'pre-wrap' }}>
            {report.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
            {report.error && `\n错误：${report.error}`}
          </div>
        </div>
      )}

      {/* 槽位卡片 */}
      <div className="grid grid-cols-2 gap-2.5">
        {slots.map((s) => {
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
                <button className="btn gh" onClick={() => removeSlot(s.id, s.label)} disabled={busy}>
                  删除
                </button>
              </div>
            </div>
          );
        })}
        {slots.length === 0 && (
          <div
            className="card"
            style={{ padding: 18, color: 'var(--color-text-3)', fontSize: 12, gridColumn: '1/3' }}
          >
            还没有槽位 —— 登录 WB 后点「保存当前登录为槽位」，或点「导入旧槽位」从
            ~/.workbuddy-launcher 迁移。
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 10 }}>
        · 安全红线：切换流程 检测进程 →（WB 运行中需确认后关闭）→ 备份（backups/auth-&lt;时间戳&gt;/）→
        恢复槽位 → JSON 校验 → 重启 WB；任意一步失败自动回滚 · 关闭 WB 必须经用户确认，绝不静默强杀
      </div>

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
    </div>
  );
}
