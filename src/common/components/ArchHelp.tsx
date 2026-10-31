import { useEffect, useState } from 'react';

/** 页面架构图入口：右下角「?」固钉，点击弹出全局弹窗展示该岛架构设计 */
export function ArchHelp({ title, desc, img }: { title: string; desc: string; img: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="arch-fab"
        title={`架构设计：${title}`}
        aria-label="查看架构设计"
        onClick={() => setOpen(true)}
      >
        ?
      </button>
      {open && (
        <div className="arch-mask" onClick={() => setOpen(false)}>
          <div className="card arch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="arch-modal-head">
              <div>
                <b style={{ fontSize: 14 }}>{title}</b>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-3)', marginTop: 3 }}>{desc}</div>
              </div>
              <button
                className="btn gh"
                style={{ flex: 'none', width: 32, padding: '5px 0' }}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="arch-modal-body">
              <img src={img} alt={title} style={{ width: '100%', display: 'block' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
