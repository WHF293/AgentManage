import { useNavStore } from '../stores/nav';
import { PageHeader } from '../common/components/PageHeader';
import { LogoMark } from '../common/components/LogoMark';

/** M0 各岛占位空态：给出里程碑与该岛的一句话职责，后续里程碑逐岛替换 */
export function PlaceholderPage({ id, milestone }: { id: string; milestone: string }) {
  const label = useNavStore((s) => s.active);
  return (
    <div>
      <PageHeader
        title={label}
        sub="Islands 原则：本岛独立成卡片，后续里程碑填充"
      />
      <div
        className="card flex flex-col items-center justify-center"
        style={{ minHeight: 320, gap: 12, color: 'var(--color-text-3)' }}
      >
        <div style={{ color: 'var(--color-primary)', opacity: 0.55 }}>
          <LogoMark size={56} />
        </div>
        <div style={{ fontWeight: 700, color: 'var(--color-text-2)' }}>
          「{id}」岛建设中
        </div>
        <div style={{ fontSize: 12 }}>{milestone}</div>
      </div>
    </div>
  );
}
