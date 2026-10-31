import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { NAV_ITEMS, useNavStore } from './stores/nav';
import { useToastStore } from './stores/ui';
import { TitleBar } from './common/components/TitleBar';
import { LogoMark } from './common/components/LogoMark';
import { DashboardPage } from './pages/Dashboard';
import { SkillsPage } from './pages/Skills';
import { McpPage } from './pages/Mcp';
import { ModelsPage } from './pages/Models';
import { AccountsPage } from './pages/Accounts';
import { MemoryPage } from './pages/Memory';
import { SettingsPage } from './pages/Settings';

function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item${t.kind === 'err' ? ' err' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function CurrentPage() {
  const active = useNavStore((s) => s.active);
  switch (active) {
    case 'dashboard':
      return <DashboardPage />;
    case 'skills':
      return <SkillsPage />;
    case 'mcp':
      return <McpPage />;
    case 'models':
      return <ModelsPage />;
    case 'accounts':
      return <AccountsPage />;
    case 'memory':
      return <MemoryPage />;
    case 'settings':
      return <SettingsPage />;
  }
}

export default function App() {
  const { active, setActive } = useNavStore();

  // 启动时恢复「关闭进托盘」偏好（Rust 侧默认开启）
  useEffect(() => {
    if (localStorage.getItem('agenthub.closeToTray') === '0') {
      void invoke('set_close_to_tray', { enabled: false }).catch(() => {});
    }
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      <TitleBar />
      <ToastHost />

      <div className="relative z-1 flex min-h-0 flex-1">
        <aside className="sidebar">
          <div className="logo" style={{ color: 'var(--color-primary)' }}>
            <LogoMark size={20} />
            <span style={{ color: 'var(--color-text-1)' }}>AgentHub</span>
          </div>
          <nav>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nv${active === item.id ? ' on' : ''}`}
                onClick={() => setActive(item.id)}
              >
                <span className="ico">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex-1" />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
          <CurrentPage />
        </main>
      </div>
    </div>
  );
}
