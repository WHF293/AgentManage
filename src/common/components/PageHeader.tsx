export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-3">
      <h5 style={{ fontSize: 15, fontWeight: 800 }}>{title}</h5>
      {sub ? (
        <div style={{ color: 'var(--color-text-3)', fontSize: 11.5 }}>{sub}</div>
      ) : null}
    </div>
  );
}
