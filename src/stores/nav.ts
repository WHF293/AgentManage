import { create } from 'zustand';

export type PageId =
  | 'dashboard'
  | 'accounts'
  | 'skills'
  | 'mcp'
  | 'models'
  | 'memory'
  | 'plugins'
  | 'settings'
  | 'architecture'
  | 'help';

export type DefaultPage = 'dashboard' | 'accounts';

export interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

/** 侧栏 8 岛（总览已合并用量页；Architecture / 使用说明走顶栏 icon，不占侧栏） */
export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Usage', icon: '▦' },
  { id: 'accounts', label: 'Account', icon: '⇄' },
  { id: 'skills', label: 'Skill', icon: '▤' },
  { id: 'mcp', label: 'MCP', icon: '⌗' },
  { id: 'models', label: 'Model', icon: '✦' },
  { id: 'memory', label: 'Memory', icon: '❑' },
  { id: 'plugins', label: 'Plugin', icon: '⧉' },
  { id: 'settings', label: 'Setting', icon: '⚙' },
];

const FIRST_RUN_KEY = 'agenthub.firstRunDone';
const DEFAULT_PAGE_KEY = 'agenthub.defaultPage';

/** 读取用户设置的默认打开页（usage / account），未设置 = usage */
export function getDefaultPage(): DefaultPage {
  return localStorage.getItem(DEFAULT_PAGE_KEY) === 'accounts' ? 'accounts' : 'dashboard';
}

/** 设置页「默认打开页面」配置项（下次启动生效） */
export function setDefaultPage(p: DefaultPage): void {
  localStorage.setItem(DEFAULT_PAGE_KEY, p);
}

/**
 * 启动默认页：
 * - 首次安装（本地无使用记录）→ 使用说明页，方便新用户快速上手
 * - 之后按设置页「默认打开页面」打开（默认 Usage）
 */
export function initialPage(): PageId {
  if (localStorage.getItem(FIRST_RUN_KEY) !== '1') {
    localStorage.setItem(FIRST_RUN_KEY, '1');
    return 'help';
  }
  return getDefaultPage();
}

interface NavState {
  active: PageId;
  setActive: (page: PageId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  active: initialPage(),
  setActive: (active) => set({ active }),
}));
