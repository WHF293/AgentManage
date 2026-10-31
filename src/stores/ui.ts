import { create } from 'zustand';

/** 全局轻提示（自动消失） */
interface ToastState {
  toasts: { id: number; text: string; kind: 'ok' | 'err' }[];
  push: (text: string, kind?: 'ok' | 'err') => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = 'ok') => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2400);
  },
}));

export const toast = (text: string, kind: 'ok' | 'err' = 'ok') =>
  useToastStore.getState().push(text, kind);
