import { useState } from 'react';

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

/** 通用输入弹窗（替代原生 prompt：与 ConfirmDialog 同风格，支持多字段带默认值） */
export function InputDialog({
  title,
  message,
  fields,
  confirmLabel = '确定',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  fields: { key: string; label: string; defaultValue?: string; placeholder?: string; mono?: boolean }[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? ''])),
  );
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
        {message && (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--color-text-2)',
              margin: '10px 0 0',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.8,
            }}
          >
            {message}
          </div>
        )}
        <div style={{ display: 'grid', gap: 10, margin: '14px 0 16px' }}>
          {fields.map((f) => (
            <div key={f.key}>
              <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4 }}>{f.label}</div>
              <input
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 9,
                  padding: '7px 10px',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-1)',
                  fontSize: 12,
                  width: '100%',
                  outline: 'none',
                  fontFamily: f.mono ? 'Consolas, monospace' : undefined,
                }}
                value={values[f.key] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn gh" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className="btn"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
            onClick={() => onConfirm(values)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
