import { create } from 'zustand';

export type PageId =
  | 'dashboard'
  | 'accounts'
  | 'skills'
  | 'mcp'
  | 'models'
  | 'memory'
  | 'plugins'
  | 'settings';

export interface NavItem {
  id: PageId;
  label: string;
  icon: string;
}

/** 侧栏 8 岛（总览已合并用量页；用户定版顺序与单数文案） */
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

interface NavState {
  active: PageId;
  setActive: (page: PageId) => void;
}

export const useNavStore = create<NavState>((set) => ({
  active: 'dashboard',
  setActive: (active) => set({ active }),
}));
