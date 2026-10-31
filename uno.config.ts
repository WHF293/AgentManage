import { defineConfig, presetUno } from 'unocss';

// 颜色 / 组件态全部走 theme.css 的 CSS variables（与 UI 稿同一套 token），
// UnoCSS 只承担布局与间距工具类。
export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'island': 'rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[var(--shadow)]',
  },
});
