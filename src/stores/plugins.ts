/**
 * 插件启用状态 —— 全局共享缓存 + 订阅（可插拔适配器的「同步门控」数据源）。
 *
 * 各功能岛（Account / Model / Memory / Usage …）用 useEnabledAgents() 取已启用
 * agent 集合做置灰 / 过滤；Plugins 岛切换开关后调 refreshPlugins() 广播刷新。
 */
import { useCallback, useEffect, useState } from 'react';
import { pluginList } from '../api';

let cache: string[] | null = null;
let fetching: Promise<string[]> | null = null;
const listeners = new Set<(ids: string[]) => void>();

async function load(): Promise<string[]> {
  if (!fetching) {
    fetching = pluginList()
      .then((r) => {
        cache = r.items.filter((p) => p.enabled).map((p) => p.agent);
        for (const fn of listeners) fn(cache);
        return cache;
      })
      .catch(() => cache ?? [])
      .finally(() => {
        fetching = null;
      });
  }
  return fetching;
}

/** Plugins 岛开关后调用：失效缓存并广播 */
export function refreshPlugins(): void {
  cache = null;
  void load();
}

/**
 * 已启用 agent id 集合 hook。
 * 返回 null = 尚未加载完成（各页自行决定加载中行为）；空数组 = 一个插件都没启用。
 */
export function useEnabledAgents(): string[] | null {
  const [ids, setIds] = useState<string[] | null>(cache);
  const update = useCallback((next: string[]) => setIds(next), []);
  useEffect(() => {
    listeners.add(update);
    if (cache === null) void load();
    return () => {
      listeners.delete(update);
    };
  }, [update]);
  return ids;
}

/** 便捷判定：某 agent 是否已启用（未加载完成时按「启用」处理，避免闪烁） */
export function isAgentEnabled(ids: string[] | null, agent: string): boolean {
  return ids === null || ids.includes(agent);
}
