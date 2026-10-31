import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useDesktopChrome } from '../useDesktopChrome';
import { useThemeStore } from '../../stores/theme';
import { LogoMark } from './LogoMark';

/**
 * 自绘标题栏 —— whf-stock-board AgentWindowTitlebar.vue 的 React 等价实现。
 *
 * decorations:false 后的替代：data-tauri-drag-region 拖动（Tauri 注入脚本处理，
 * 按钮不带该属性不会误触发）+ 双击最大化 + 自绘 最小化/最大化/关闭 三键；
 * 关闭行为 = 关到托盘（Rust 侧 CloseRequested 拦截）。
 * 命中区与参考项目一致（w-11/h-9），关闭键 hover #E81123。
 */
export function TitleBar() {
  const { desktopChrome, canControlWindow } = useDesktopChrome();
  const { resolved, setMode } = useThemeStore();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!canControlWindow) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | null = null;
    let disposed = false;

    const syncMaximized = () => {
      void appWindow
        .isMaximized()
        .then((v) => {
          if (!disposed) setIsMaximized(v);
        })
        .catch(() => {
          /* 查询失败保持原值（非致命，仅影响按钮图标） */
        });
    };

    syncMaximized();
    void appWindow
      .onResized(() => syncMaximized())
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [canControlWindow]);

  if (!desktopChrome) return null;

  const minimizeWindow = () => {
    if (!canControlWindow) return;
    void getCurrentWindow().minimize();
  };
  const toggleMaximizeWindow = () => {
    if (!canControlWindow) return;
    void getCurrentWindow().toggleMaximize();
  };
  const closeWindow = () => {
    if (!canControlWindow) return;
    void getCurrentWindow().close(); // Rust 侧拦截为「关闭到托盘」
  };

  return (
    <div data-tauri-drag-region className="titlebar">
      <div className="brand" data-tauri-drag-region>
        <LogoMark size={15} />
        <span className="tt">AgentHub — AI Agent 统一管理</span>
      </div>
      <div className="flex h-full items-stretch">
        <button
          type="button"
          aria-label="切换主题"
          title={`主题：${resolved === 'dark' ? '深色' : '浅色'}（点击切换）`}
          className="winbtn"
          onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
        >
          <svg width="13" height="13" viewBox="0 0 512 512" aria-hidden="true">
            <circle cx="256" cy="256" r="170" fill="none" stroke="currentColor" strokeWidth="44" />
            <path d="M256 86 a170 170 0 0 1 0 340 z" fill="currentColor" />
          </svg>
        </button>
        <button type="button" aria-label="最小化" className="winbtn" onClick={minimizeWindow}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1 6h10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={isMaximized ? '还原' : '最大化'}
          className="winbtn"
          onClick={toggleMaximizeWindow}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="3.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M8.5 10.5h-7v-7" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          )}
        </button>
        <button type="button" aria-label="关闭" className="winbtn close" onClick={closeWindow}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
