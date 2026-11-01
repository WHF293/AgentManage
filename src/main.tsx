import React from 'react';
import ReactDOM from 'react-dom/client';
import 'uno.css';
import './styles/theme.css';
import App from './App';
import { applyAgentColors } from './agents';

// 启动即注入用户自定义的 agent 身份色（Plugin 岛配置，localStorage 持久化）
applyAgentColors();

// 页面禁止缩放：拦截 Ctrl+滚轮 / 触控板捏合 / Ctrl +/-/0 快捷键
// （Tauri 侧另在 tauri.conf.json 配置 zoomHotkeysEnabled:false 双保险）
window.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) e.preventDefault();
  },
  { passive: false },
);
window.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['=', '-', '0', '+'].includes(e.key)) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
