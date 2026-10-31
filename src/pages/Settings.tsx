import { useCallback, useEffect, useState } from 'react';
import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from '@tauri-apps/plugin-autostart';
import { invoke } from '@tauri-apps/api/core';
import { recentOpLog, type OpLogRow } from '../api';
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

  useEffect(() => {
    void recentOpLog(10)
      .then(setOps)
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
