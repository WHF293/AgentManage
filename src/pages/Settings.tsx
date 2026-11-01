import { useCallback, useEffect, useState } from 'react';
import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import { recentOpLog, updateProxyGet, updateProxySet, type OpLogRow } from '../api';
import { PageHeader } from '../common/components/PageHeader';
import { useThemeStore, type ThemeMode } from '../stores/theme';
import { toast } from '../stores/ui';

const CLOSE_TO_TRAY_KEY = 'agenthub.closeToTray';

/** M8 设置岛：主题 / 开机自启 / 关闭到托盘 / 最近操作 */
export function SettingsPage() {
  const { mode, resolved, setMode } = useThemeStore();
  const [autostart, setAutostart] = useState(true);
  const [closeToTray, setCloseToTray] = useState<boolean>(
    () => localStorage.getItem(CLOSE_TO_TRAY_KEY) !== '0',
  );
  const [ops, setOps] = useState<OpLogRow[]>([]);
  const [proxyUrl, setProxyUrl] = useState('');
  const [proxySaved, setProxySaved] = useState('');
  const [savingProxy, setSavingProxy] = useState(false);

  useEffect(() => {
    void recentOpLog(10)
      .then(setOps)
      .catch(() => {});
    void updateProxyGet()
      .then((u) => {
        // 未配置时预填默认本地代理（默认 127.0.0.1:7897，可随意改；清空保存 = 恢复直连）
        setProxyUrl(u || 'http://127.0.0.1:7897');
        setProxySaved(u);
      })
      .catch(() => {});
    // 自启动：以系统实际状态为准（浏览器预览回退 localStorage）
    (async () => {
      try {
        setAutostart(await autostartIsEnabled());
      } catch {
        setAutostart(localStorage.getItem('agenthub.autostart') !== '0');
      }
    })();
  }, []);

  const toggleAutostart = useCallback(async (on: boolean) => {
    setAutostart(on);
    localStorage.setItem('agenthub.autostart', on ? '1' : '0');
    try {
      if (on) await autostartEnable();
      else await autostartDisable();
      toast(on ? '已开启开机自启' : '已关闭开机自启');
    } catch {
      toast(on ? '自启动开启失败（需在应用内操作）' : '自启动关闭失败', 'err');
      setAutostart(!on);
    }
  }, []);

  const toggleCloseToTray = useCallback(async (on: boolean) => {
    setCloseToTray(on);
    localStorage.setItem(CLOSE_TO_TRAY_KEY, on ? '1' : '0');
    try {
      await invoke('set_close_to_tray', { enabled: on });
      toast(on ? '关闭将最小化到托盘' : '关闭将直接退出应用');
    } catch {
      toast('设置失败', 'err');
      setCloseToTray(!on);
    }
  }, []);

  const saveProxy = useCallback(async () => {
    setSavingProxy(true);
    try {
      await updateProxySet(proxyUrl.trim());
      setProxySaved(proxyUrl.trim());
      toast(proxyUrl.trim() ? '更新代理已保存，立即生效' : '已清除更新代理，恢复直连');
    } catch (e) {
      toast(String(e).replace(/^.*?"|".*$/g, '') || '保存失败', 'err');
    } finally {
      setSavingProxy(false);
    }
  }, [proxyUrl]);

  const modes: [ThemeMode, string][] = [
    ['system', '跟随系统'],
    ['light', '浅色'],
    ['dark', '深色'],
  ];

  return (
    <div>
      <PageHeader title="Setting" sub="所有写操作均有备份，可在此管理偏好" />
      <div className="list">
        <div className="li">
          <div className="ic">◐</div>
          <div className="grow">
            <div className="nm">主题</div>
            <div className="ds">CSS variables 双主题 · 当前{resolved === 'dark' ? '深色' : '浅色'}</div>
          </div>
          {modes.map(([m, label]) => (
            <span
              key={m}
              className={`chip ${mode === m ? 'ok' : 'off'}`}
              style={{ cursor: 'pointer' }}
              onClick={() => setMode(m)}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="li">
          <div className="ic">▲</div>
          <div className="grow">
            <div className="nm">开机自启</div>
            <div className="ds">登录 Windows 后自动启动 AgentHub（Tauri autostart 插件）</div>
          </div>
          <span
            className={`sw${autostart ? ' on' : ''}`}
            onClick={() => void toggleAutostart(!autostart)}
          />
        </div>
        <div className="li">
          <div className="ic">⬇</div>
          <div className="grow">
            <div className="nm">关闭进入系统托盘</div>
            <div className="ds">点关闭不退出，最小化到托盘（托盘菜单可「打开面板 / 退出」）</div>
          </div>
          <span
            className={`sw${closeToTray ? ' on' : ''}`}
            onClick={() => void toggleCloseToTray(!closeToTray)}
          />
        </div>
        <div className="li">
          <div className="ic">⇅</div>
          <div className="grow">
            <div className="nm">更新代理</div>
            <div className="ds">
              检查更新 / 下载安装包经此代理访问 GitHub（默认 127.0.0.1:7897；代理工具换地址/端口直接改这里，
              支持 http / socks5，无需更新应用）；清空保存 = 恢复直连
            </div>
            <div className="flex" style={{ gap: 6, marginTop: 6 }}>
              <input
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  padding: '6px 10px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-1)',
                  fontSize: 12,
                  flex: 1,
                  minWidth: 0,
                  outline: 'none',
                }}
                placeholder="http://127.0.0.1:7897"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && proxyUrl.trim() !== proxySaved) void saveProxy();
                }}
              />
              <button
                className="btn gh"
                disabled={savingProxy || proxyUrl.trim() === proxySaved}
                onClick={() => void saveProxy()}
              >
                保存
              </button>
            </div>
          </div>
          <span className={`chip ${proxySaved ? 'ok' : 'off'}`}>
            {proxySaved ? '走代理' : '直连'}
          </span>
        </div>
        <div className="li">
          <div className="ic">↻</div>
          <div className="grow">
            <div className="nm">操作日志 op_log（最近 10 条）</div>
            <div className="ds">
              {ops.length === 0
                ? '暂无写操作记录'
                : ops.map((o) => `${o.created_at ?? ''} ${o.action} ${o.target ?? ''}`).join('  ·  ')}
            </div>
          </div>
          <span className="chip off">{ops.length} 条</span>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', marginTop: 10 }}>
        · 所有对目标配置文件的写入：先备份 → 原子写 → 校验 → 失败回滚 · 中央仓库 ~/.agenthub/ ·
        数据全部本地，不外发
      </div>
    </div>
  );
}
