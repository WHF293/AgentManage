import { isTauri } from '@tauri-apps/api/core';

/**
 * 桌面外壳开关 —— 移植自 whf-stock-board use-desktop-chrome.ts（React 等价实现）。
 *
 * URL `?desktopTitlebar=0` 显式关闭模拟、`=1` 显式开启（同时写穿 localStorage）；
 * 无参数用持久化值，从未设置则默认开启 —— 浏览器默认按桌面外壳渲染，便于样式比对。
 * Tauri 客户端恒为桌面布局，不受开关影响。
 */
const QUERY_KEY = 'desktopTitlebar';
const STORAGE_KEY = 'agenthub.debug.desktopTitlebar';

function resolveDesktopTitlebar(): '0' | '1' {
  const query = new URLSearchParams(window.location.search).get(QUERY_KEY);
  if (query === '1' || query === '0') {
    localStorage.setItem(STORAGE_KEY, query);
    return query;
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === '0' ? '0' : '1';
}

const resolvedTitlebar = resolveDesktopTitlebar();
const inTauri = isTauri();

export function useDesktopChrome(): {
  desktopChrome: boolean;
  canControlWindow: boolean;
} {
  return {
    desktopChrome: inTauri || resolvedTitlebar === '1',
    canControlWindow: inTauri,
  };
}
