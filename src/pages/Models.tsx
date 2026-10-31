import { useCallback, useEffect, useState } from 'react';
import {
  providerDelete,
  providerFetchModels,
  providerSave,
  providerSetDefault,
  providersOverview,
  type FetchResult,
  type ProvidersOverview,
  type ZcodeProviderLive,
} from '../api';
import { PageHeader } from '../common/components/PageHeader';

const field: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  padding: '7px 10px',
  background: 'var(--color-surface)',
  color: 'var(--color-text-1)',
  fontSize: 12,
  width: '100%',
  outline: 'none',
};
const label: React.CSSProperties = { fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4 };

/** E2 · Provider 编辑 + 在线拉取模型列表（勾选制，杜绝手写模型名） */
function ProviderModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: ZcodeProviderLive | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id] = useState(initial?.id ?? crypto.randomUUID());
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState(initial?.kind ?? 'openai-compatible');
  const [baseUrl, setBaseUrl] = useState(initial?.base_url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [fetched, setFetched] = useState<FetchResult | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial?.models ?? []));
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doFetch = async () => {
    setErr(null);
    setFetching(true);
    try {
      const r = await providerFetchModels({
        id,
        kind,
        base_url: baseUrl,
        api_key: apiKey || undefined,
      });
      setFetched(r);
      setPicked(new Set(initial?.models ?? []));
    } catch (e) {
      setErr(String(e));
    } finally {
      setFetching(false);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!name.trim() || !baseUrl.trim()) {
      setErr('名称与 baseURL 必填');
      return;
    }
    setSaving(true);
    try {
      await providerSave({
        id,
        name: name.trim(),
        kind,
        base_url: baseUrl.trim(),
        api_key: apiKey || undefined,
        models: [...picked],
      });
      onSaved();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (m: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.25)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 600, maxHeight: '84vh', overflow: 'auto', cursor: 'default' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <b style={{ fontSize: 14 }}>{initial ? `编辑 Provider · ${initial.name}` : '新增 Provider'}</b>
          <span style={{ color: 'var(--color-text-3)', cursor: 'pointer' }} onClick={onClose}>✕</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5" style={{ marginTop: 10 }}>
          <div>
            <div style={label}>名称</div>
            <input style={field} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div style={label}>类型 kind</div>
            <select style={field} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="openai-compatible">openai-compatible</option>
              <option value="anthropic">anthropic</option>
            </select>
          </div>
          <div style={{ gridColumn: '1/3' }}>
            <div style={label}>baseURL</div>
            <input style={{ ...field, fontFamily: 'Consolas, monospace' }} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1 或 https://…/api/anthropic" />
          </div>
          <div style={{ gridColumn: '1/3' }}>
            <div style={label}>
              API Key
              {initial?.has_api_key && (
                <span style={{ marginLeft: 6 }}>
                  （已配置 ••••••••，留空 = 不修改）
                </span>
              )}
            </div>
            <input type="password" style={field} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={initial?.has_api_key ? '留空保持不变' : 'sk-…'} />
          </div>
        </div>

        <div className="flex items-center" style={{ gap: 8, margin: '12px 0' }}>
          <b style={{ fontSize: 12 }}>模型列表</b>
          {fetched && !fetched.suggested && (
            <span className="chip ok">已拉取 {fetched.models.length} 个</span>
          )}
          {fetched?.suggested && (
            <span className="chip warn" title={fetched.traces.at(-1)?.note}>
              内置推荐（网关无 /v1/models，可编辑）
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn p" style={{ fontSize: 11 }} onClick={doFetch} disabled={fetching || !baseUrl.trim()}>
            {fetching ? '拉取中…' : '⌕ 获取模型列表'}
          </button>
        </div>

        {fetched && (
          <div className="list" style={{ marginBottom: 10, maxHeight: 220, overflow: 'auto' }}>
            {fetched.models.map((m) => (
              <div className="li" key={m} style={{ padding: '6px 12px' }}>
                <span className={`sw${picked.has(m) ? ' on' : ' small'}`} onClick={() => toggle(m)} />
                <div className="grow">
                  <div className="nm" style={{ fontSize: 11.5, fontFamily: 'Consolas, monospace' }}>{m}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {fetched && (
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--color-text-3)',
              background: 'var(--color-code-bg)',
              borderRadius: 10,
              padding: '6px 10px',
              marginBottom: 10,
            }}
          >
            {fetched.traces.map((t, i) => (
              <div key={i}>
                {t.ok ? '✓' : '✕'} {t.url} {t.status ? `→ ${t.status}` : ''}（{t.ms}ms）· {t.note}
              </div>
            ))}
          </div>
        )}
        {!initial?.models?.length && !fetched && (
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 10 }}>
            模型名一律从列表勾选，不手写 —— 填好 baseURL 与 Key 后点「获取模型列表」。
          </div>
        )}

        {err && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{err}</div>
        )}
        <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn gh" onClick={onClose}>取消</button>
          <button className="btn p" onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '保存并写入 ZCode'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** M4 模型岛 —— E1 Provider 列表（ZCode 直写已完成，WB 探测占位） */
export function ModelsPage() {
  const [data, setData] = useState<ProvidersOverview | null>(null);
  const [editing, setEditing] = useState<ZcodeProviderLive | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setData(await providersOverview());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (p: ZcodeProviderLive) => {
    if (!confirm(`从 ZCode 删除 provider「${p.name}」？（config.json 有备份）`)) return;
    try {
      await providerDelete(p.id);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const setDefault = async (p: ZcodeProviderLive) => {
    // selected key 形如 "coding-plan:builtin:bigmodel-coding-plan"；family 取 builtin: 前的家族名或手输
    const family = prompt('家族名 family（如 bigmodel / zai）：', 'bigmodel');
    if (!family) return;
    const key = prompt('SelectedKey（如 coding-plan:builtin:bigmodel-coding-plan）：', `coding-plan:${p.id}`);
    if (!key) return;
    try {
      await providerSetDefault(family, key);
      setMessage(`已设为 ${family} 家族默认（需重启 ZCode 生效）`);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const providers = data?.providers ?? [];

  return (
    <div>
      <PageHeader
        title={`模型 Provider（${providers.length || '…'}）`}
        sub="一次配置 → 直写 ZCode v2/config.json · API Key 只存目标文件不入库 · WB 侧接入点探测为 M4 后续项"
      />

      <div className="mb-3 flex items-center" style={{ gap: 8 }}>
        <span style={{ flex: 1 }} />
        {message && <span className="chip ok">{message}</span>}
        <button className="btn p" onClick={() => setCreating(true)}>⊕ 新增 Provider</button>
      </div>

      {error && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-danger)',
            background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
            borderRadius: 10,
            padding: '8px 12px',
            marginBottom: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </div>
      )}

      <div className="list">
        {providers.map((p) => {
          const selectedEntry = Object.entries(data?.selected_keys ?? {}).find(([, v]) =>
            v.endsWith(p.id),
          );
          return (
            <div className="li" key={p.id}>
              <div className="ic">✦</div>
              <div className="grow">
                <div className="nm">
                  {p.name}
                  {p.builtin && <span className="chip off" style={{ marginLeft: 6 }}>builtin</span>}
                  {selectedEntry && (
                    <span className="chip ok" style={{ marginLeft: 6 }}>
                      默认 · {selectedEntry[0]}
                    </span>
                  )}
                </div>
                <div className="ds" style={{ fontFamily: 'Consolas, monospace' }}>
                  {p.kind} · {p.base_url || '—'} · {p.models.length} 个模型 · Key{p.has_api_key ? '已配置' : '未配置'}
                </div>
              </div>
              <span className={`chip ${p.kind === 'anthropic' ? 'ok' : 'off'}`}>{p.kind}</span>
              <span className="chip off" style={{ cursor: 'pointer' }} onClick={() => setEditing(p)}>编辑</span>
              <span className="chip warn" style={{ cursor: 'pointer' }} onClick={() => setDefault(p)}>设默认</span>
              {!p.builtin && (
                <span className="chip err" style={{ cursor: 'pointer' }} onClick={() => remove(p)}>删除</span>
              )}
            </div>
          );
        })}
        {providers.length === 0 && (
          <div className="li" style={{ color: 'var(--color-text-3)', fontSize: 12 }}>
            未读取到 provider（~/.zcode/v2/config.json 为空或不存在）
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 10 }}>
        · 拉取策略：/v1/models 候选链（/v&#123;N&#125; 版本段先拼原样 → /v1/models → 兼容后缀剥离；anthropic 原生 x-api-key 优先）
        · 修改「默认」后需重启 ZCode 生效 · WB 侧第三方模型接入点运行时探测（未果时引导打开 WB 设置页）
      </div>

      {(creating || editing) && (
        <ProviderModal
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
