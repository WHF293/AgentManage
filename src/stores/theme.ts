import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'agenthub.theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

function apply(mode: ThemeMode): { mode: ThemeMode; resolved: 'light' | 'dark' } {
  const r = resolve(mode);
  document.body.classList.toggle('dark', r === 'dark');
  return { mode, resolved: r };
}

function initial(): { mode: ThemeMode; resolved: 'light' | 'dark' } {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  return apply(stored ?? 'system');
}

// 跟随系统：监听一次系统配色变化
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const mode = useThemeStore.getState().mode;
  if (mode === 'system') useThemeStore.setState(apply('system'));
});

export const useThemeStore = create<ThemeState>((set) => ({
  ...initial(),
  setMode: (mode) => set(apply(mode)),
}));
