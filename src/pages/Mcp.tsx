import { useCallback, useEffect, useState } from 'react';
import {
  mcpAdopt,
  mcpDelete,
  mcpOverview,
  mcpSave,
  mcpToggle,
  mcpValidate,
  type McpOverviewItem,
  type McpOverviewPayload,
  type McpServerInput,
} from '../api';
import { PageHeader } from '../common/components/PageHeader';

const STATUS_TEXT: Record<string, string> = {
  ok: '✓',
  disabled: '禁用',
  missing: '未分发',
  drifted: '漂移',
  unsupported: '不支持 HTTP → 仅 WB',
};
const STATUS_COLOR: Record<string, string> = {
  ok: 'ok',
  disabled: 'off',
  missing: 'off',
  drifted: 'warn',
  unsupported: 'warn',
};

/** 解析用户粘贴的 MCP JSON：支持 {mcpServers:{名:条目}}、{名:条目} 批量，编辑态接受裸条目 */
function parseMcpJson(
  text: string,
  fixedName?: string,
): { name: string; entry: Record<string, unknown> }[] {
  const v: unknown = JSON.parse(text);
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('JSON 需为对象');
  }
  const looksLikeEntry = (x: Record<string, unknown>) =>
    ['type', 'command', 'url', 'args', 'env', 'headers', 'disabled', 'enabled'].some((k) => k in x);
  if (fixedName) {
    const obj = v as Record<string, unknown>;
    if (looksLikeEntry(obj)) return [{ name: fixedName, entry: obj }];
    const keys = Object.keys(obj);
    if (
      keys.length === 1 &&
      obj[keys[0]] &&
      typeof obj[keys[0]] === 'object' &&
      !Array.isArray(obj[keys[0]])
    ) {
      return [{ name: fixedName, entry: obj[keys[0]] as Record<string, unknown> }];
    }
    throw new Error('编辑模式下 JSON 需为单个 server 条目，如 { "type": "stdio", "command": "…" }');
  }
  const obj = v as Record<string, unknown>;
  let map: Record<string, unknown>;
  if (obj.mcpServers && typeof obj.mcpServers === 'object' && !Array.isArray(obj.mcpServers)) {
    map = obj.mcpServers as Record<string, unknown>;
  } else {
    const vals = Object.values(obj);
    if (vals.length > 0 && vals.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      map = obj;
    } else {
      throw new Error('JSON 需为 { "mcpServers": { 名称: {…} } } 或 { 名称: {…} }');
    }
  }
  return Object.entries(map).map(([name, entry]) => ({ name, entry: entry as Record<string, unknown> }));
}

function entryToInput(
  name: string,
  e: Record<string, unknown>,
  toWb: boolean,
  toZc: boolean,
): McpServerInput {
  const args = Array.isArray(e.args)
    ? e.args.map(String)
    : typeof e.args === 'string'
      ? (e.args as string).split(/\s+/).filter(Boolean)
      : [];
  const kv = (x: unknown): Record<string, string> =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
        )
      : {};
  return {
    name,
    type: String(e.type ?? 'stdio'),
    command: typeof e.command === 'string' ? e.command : null,
    args,
    url: typeof e.url === 'string' ? e.url : null,
    env: kv(e.env),
    headers: kv(e.headers),
    enabled_wb: toWb,
    enabled_zcode: toZc,
  };
}

/** D2 新增/编辑弹窗（表单 / JSON 两种输入方式） */
function ServerModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: McpOverviewItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState(initial?.type ?? 'stdio');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [argsText, setArgsText] = useState('');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [envText, setEnvText] = useState('');
  const [toWb, setToWb] = useState(true);
  const [toZc, setToZc] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState<string>(() =>
    initial
      ? JSON.stringify(
          {
            [initial.name]: {
              type: initial.type,
              ...(initial.command ? { command: initial.command } : {}),
              ...(initial.url ? { url: initial.url } : {}),
            },
          },
          null,
          2,
        )
      : JSON.stringify(
          {
            mcpServers: {
              'tavily-search': {
                type: 'stdio',
                command: 'cmd',
                args: ['/c', 'npx -y tavily-mcp'],
                env: { TAVILY_API_KEY: 'tvly-…' },
              },
            },
          },
          null,
          2,
        ),
  );

  const submit = async () => {
    setErr(null);
    if (mode === 'json') {
      let entries: { name: string; entry: Record<string, unknown> }[];
      try {
        entries = parseMcpJson(jsonText, initial?.name);
      } catch (e) {
        setErr(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      const fails: string[] = [];
      let okCount = 0;
      for (const { name: n, entry } of entries) {
        try {
          await mcpSave(entryToInput(n, entry, toWb, toZc));
          okCount += 1;
        } catch (e) {
          fails.push(`${n}: ${e}`);
        }
      }
      if (fails.length > 0) {
        setErr(`部分保存失败（成功 ${okCount} 个）：\n${fails.join('\n')}`);
        return;
      }
      onSaved();
      return;
    }
    if (!name.trim()) {
      setErr('名称必填');
      return;
    }
    const input: McpServerInput = {
      name: name.trim(),
      type: kind,
      command: command.trim() || null,
      args: argsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      url: url.trim() || null,
      env: Object.fromEntries(
        envText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => {
            const i = l.indexOf('=');
            return i > 0 ? [l.slice(0, i), l.slice(i + 1)] : [l, ''];
          }),
      ),
      enabled_wb: toWb,
      enabled_zcode: toZc,
    };
    try {
      await mcpSave(input);
      onSaved();
    } catch (e) {
      setErr(String(e));
    }
  };

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
  const label: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--color-text-3)',
    marginBottom: 4,
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
        style={{ width: 560, maxHeight: '84vh', overflow: 'auto', cursor: 'default' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <b style={{ fontSize: 14 }}>{initial ? `编辑 · ${initial.name}` : '新增 MCP Server'}</b>
          <span style={{ flex: 1 }} />
          {(['form', 'json'] as const).map((m) => (
            <span
              key={m}
              className={`chip ${mode === m ? 'ok' : 'off'}`}
              style={{ cursor: 'pointer', fontSize: 11 }}
              onClick={() => setMode(m)}
            >
              {m === 'form' ? '表单' : 'JSON'}
            </span>
          ))}
        </div>
        {mode === 'form' && (
        <div className="grid grid-cols-2 gap-2.5" style={{ marginTop: 12 }}>
          <div>
            <div style={label}>名称</div>
            <input style={field} value={name} disabled={!!initial} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <div style={label}>类型</div>
            <select style={field} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="stdio">stdio</option>
              <option value="streamableHttp">streamableHttp（仅 WB）</option>
            </select>
          </div>
          {kind === 'stdio' ? (
            <>
              <div style={{ gridColumn: '1/3' }}>
                <div style={label}>命令 command</div>
                <input style={{ ...field, fontFamily: 'Consolas, monospace' }} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx / cmd / uvx…" />
              </div>
              <div style={{ gridColumn: '1/3' }}>
                <div style={label}>参数 args（每行一个）</div>
                <textarea style={{ ...field, minHeight: 56, fontFamily: 'Consolas, monospace' }} value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder={'/c\nnpx -y some-mcp'} />
              </div>
            </>
          ) : (
            <div style={{ gridColumn: '1/3' }}>
              <div style={label}>URL</div>
              <input style={{ ...field, fontFamily: 'Consolas, monospace' }} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/mcp" />
            </div>
          )}
          <div style={{ gridColumn: '1/3' }}>
            <div style={label}>环境变量 env（可选，KEY=VALUE，每行一个）</div>
            <textarea style={{ ...field, minHeight: 40, fontFamily: 'Consolas, monospace' }} value={envText} onChange={(e) => setEnvText(e.target.value)} placeholder="API_KEY=…" />
          </div>
        </div>
        )}
        {mode === 'json' && (
          <div style={{ marginTop: 12 }}>
            <div style={label}>
              粘贴 MCP JSON（支持 mcpServers 包裹 / 名称→条目 映射，可批量粘贴；headers 支持；
              WB 的 disabled 与 ZCode 的 enabled 会由下方开关统一决定）
            </div>
            <textarea
              style={{ ...field, minHeight: 220, fontFamily: 'Consolas, monospace', lineHeight: 1.6 }}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              spellCheck={false}
            />
          </div>
        )}
        <div className="flex items-center" style={{ gap: 12, margin: '12px 0', fontSize: 12 }}>
          <span className={`sw${toWb ? ' on' : ''}`} onClick={() => setToWb(!toWb)} />
          分发到 WorkBuddy
          <span className={`sw${toZc ? ' on' : ''}`} onClick={() => setToZc(!toZc)} />
          分发到 ZCode
        </div>
        {err && (
          <div style={{ fontSize: 12, color: 'var(--color-danger)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{err}</div>
        )}
        <div className="flex" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn gh" onClick={onClose}>取消</button>
          <button className="btn p" onClick={submit}>保存并同步双端</button>
        </div>
      </div>
    </div>
  );
}

/** M3 MCP 岛 —— D1 统一列表（双端开关/漂移检测） + D2 弹窗 */
export function McpPage() {
  const [payload, setPayload] = useState<McpOverviewPayload | null>(null);
  const [editing, setEditing] = useState<McpOverviewItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setPayload(await mcpOverview());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const adopt = async (overwrite: boolean) => {
    setError(null);
    try {
      const n = await mcpAdopt(overwrite);
      setMessage(`已收编 ${n} 个 server 进统一定义`);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const toggle = async (item: McpOverviewItem, agent: 'workbuddy' | 'zcode') => {
    try {
      const enabled = agent === 'workbuddy' ? !item.enabled_wb : !item.enabled_zcode;
      await mcpToggle(item.name, agent, enabled);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async (item: McpOverviewItem) => {
    if (!confirm(`删除统一定义「${item.name}」并从双端移除？（目标文件有备份）`)) return;
    try {
      await mcpDelete(item.name);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const validate = async () => {
    try {
      const p = await mcpValidate();
      setPayload(p);
      const drifted =
        p.items.filter((i) => i.wb_status === 'drifted' || i.zcode_status === 'drifted').length +
        p.drift.wb_only.length +
        p.drift.zcode_only.length;
      setMessage(drifted === 0 ? '目标文件与统一定义一致，无漂移' : `发现 ${drifted} 处漂移/未收编`);
    } catch (e) {
      setError(String(e));
    }
  };

  const items = payload?.items ?? [];
  const hasDb = items.length > 0;
  const hasDrift =
    (payload?.drift.wb_only.length ?? 0) + (payload?.drift.zcode_only.length ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title={`MCP Servers（${items.length || '…'}）`}
        sub="统一定义 → WB mcp.json（disabled 字段）× ZCode cli/config.json（enabled 字段）"
      />

      {/* 收编提示（未接管 / 漂移时显示） */}
      {(!hasDb || hasDrift) && (
        <div className="card" style={{ padding: 14, marginBottom: 12, borderColor: 'var(--color-primary)' }}>
          <div className="flex items-center justify-between">
            <div style={{ fontSize: 12 }}>
              <b>{hasDb ? '发现未收编条目' : '首次接管'}</b>
              <span style={{ color: 'var(--color-text-2)' }}>
                {' '}
                · 目标文件中有 {payload?.drift.wb_only.length ?? 0} 个（WB）/
                {payload?.drift.zcode_only.length ?? 0} 个（ZCode）server 不在统一定义中
              </span>
            </div>
            <button className="btn p" onClick={() => adopt(false)}>
              ⊕ 收编进统一定义
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center" style={{ gap: 8 }}>
        <span style={{ flex: 1 }} />
        {message && <span className="chip ok">{message}</span>}
        <button className="btn gh" onClick={validate}>↻ 校验目标文件</button>
        <button className="btn p" onClick={() => setCreating(true)}>⊕ 新增 Server</button>
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
        {items.length === 0 ? (
          <div className="li" style={{ color: 'var(--color-text-3)', fontSize: 12 }}>
            统一定义为空 —— 点上方「收编」把双端现有 server 纳入管理，或新增。
          </div>
        ) : (
          items.map((item) => (
            <div className="li" key={item.name}>
              <span
                className={`sw${item.enabled_wb || item.enabled_zcode ? ' on' : ''}`}
                title="点击切换双端启用（任一端启用即亮）"
                onClick={() => toggle(item, item.enabled_wb ? 'workbuddy' : 'zcode')}
              />
              <div className="ic">⌗</div>
              <div className="grow">
                <div className="nm">{item.name}</div>
                <div className="ds" style={{ fontFamily: 'Consolas, monospace' }}>
                  {item.type} · {item.command ?? item.url ?? '—'}
                </div>
              </div>
              <span
                className={`chip ${STATUS_COLOR[item.wb_status]}`}
                style={{ cursor: 'pointer' }}
                title="点击切换 WB 启用态"
                onClick={() => toggle(item, 'workbuddy')}
              >
                WB {STATUS_TEXT[item.wb_status]}
              </span>
              <span
                className={`chip ${STATUS_COLOR[item.zcode_status]}`}
                style={{ cursor: item.zcode_unsupported ? 'default' : 'pointer' }}
                title={item.zcode_unsupported ? undefined : '点击切换 ZCode 启用态'}
                onClick={item.zcode_unsupported ? undefined : () => toggle(item, 'zcode')}
              >
                ZCode {STATUS_TEXT[item.zcode_status]}
              </span>
              <span
                className="chip off"
                style={{ cursor: 'pointer' }}
                onClick={() => setEditing(item)}
              >
                编辑
              </span>
              <span className="chip err" style={{ cursor: 'pointer' }} onClick={() => remove(item)}>
                删除
              </span>
            </div>
          ))
        )}
      </div>

      {(creating || editing) && (
        <ServerModal
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
