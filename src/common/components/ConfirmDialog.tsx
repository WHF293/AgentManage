/** 通用确认弹窗（替代原生 confirm：居中、主题化、语义色按钮） */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.35)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ width: 440, cursor: 'default', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <b style={{ fontSize: 14 }}>{title}</b>
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--color-text-2)',
            margin: '10px 0 16px',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.8,
          }}
        >
          {message}
        </div>
        <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn gh" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn"
            style={danger ? { background: 'var(--color-danger)', color: '#fff' } : { background: 'var(--color-primary)', color: '#fff' }}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
