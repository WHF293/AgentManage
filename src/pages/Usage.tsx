import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import * as echarts from 'echarts/core';
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components';
import { BarChart, LineChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';
import {
  usageCollect,
  usageMatrix,
  usageOverview,
  type MatrixCell,
  type UsageOverview,
} from '../api';
import { PageHeader } from '../common/components/PageHeader';
import { useThemeStore } from '../stores/theme';

// ECharts 按需导入
echarts.use([
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  BarChart,
  LineChart,
  CanvasRenderer,
]);

type Granularity = 'day' | 'month' | 'year';
type ViewMode = 'calendar' | 'chart';
type AgentFilter = 'all' | 'workbuddy' | 'zcode';

const AGENT_LABEL: Record<string, string> = { zcode: 'ZCode', workbuddy: 'WorkBuddy' };
const agentColor = (agent: string) =>
  agent === 'zcode' ? '#2E9E74' : agent === 'workbuddy' ? '#8FD9BC' : '#3EB489';

const fmtTok = (n: number): string => {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)} 万`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} 千`;
  return String(n);
};

const themeColors = () => {
  const cs = getComputedStyle(document.body);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    text2: v('--color-text-2', '#55685E'),
    text3: v('--color-text-3', '#8CA096'),
    border: v('--color-border', '#DFEDE3'),
    primary: v('--color-primary', '#3EB489'),
  };
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const todayYm = () => todayStr().slice(0, 7);
const shiftMonth = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** 聚合视图：某 key（日/月/年）下的合计与 agent-model 明细 */
interface Bucket {
  tokens: number;
  calls: number;
  details: { agent: string; model: string; tokens: number }[];
}

function buildBuckets(matrix: MatrixCell[]): {
  byDay: Map<string, Bucket>;
  byMonth: Map<string, Bucket>;
  byYear: Map<string, Bucket>;
} {
  const byDay = new Map<string, Bucket>();
  const byMonth = new Map<string, Bucket>();
  const byYear = new Map<string, Bucket>();
  const touch = (m: Map<string, Bucket>, k: string) => {
    let b = m.get(k);
    if (!b) {
      b = { tokens: 0, calls: 0, details: [] };
      m.set(k, b);
    }
    return b;
  };
  for (const c of matrix) {
    const bDay = touch(byDay, c.date);
    const ym = c.date.slice(0, 7);
    const bMon = touch(byMonth, ym);
    const by = touch(byYear, c.date.slice(0, 4));
    for (const b of [bDay, bMon, by]) {
      b.tokens += c.tokens;
      b.calls += c.calls;
      b.details.push({ agent: c.agent, model: c.model, tokens: c.tokens });
    }
  }
  return { byDay, byMonth, byYear };
}

/** hover 明细文本：workbuddy-glm-5.3-flash: 1.2亿 token */
const detailText = (b: Bucket | undefined, agent: AgentFilter): string => {
  if (!b) return '0 token';
  const lines = b.details
    .filter((d) => agent === 'all' || d.agent === agent)
    .sort((a, b2) => b2.tokens - a.tokens)
    .map((d) => `${d.agent}-${d.model}: ${fmtTok(d.tokens)} token`);
  return lines.length > 0 ? lines.join('\n') : '0 token';
};

/** 五档色阶（GitHub 风格） */
const heatColor = (v: number, max: number): string => {
  if (!v) return 'var(--color-surface2)';
  const r = v / Math.max(1, max);
  if (r > 0.6) return 'var(--color-primary-strong)';
  if (r > 0.35) return '#7BCBA7';
  if (r > 0.15) return '#A9DFC8';
  if (r > 0.04) return 'var(--color-primary-soft)';
  return '#EAF6EF';
};

/** ECharts hook */
function useEChart(factory: () => echarts.EChartsCoreOption, deps: unknown[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const { resolved } = useThemeStore();
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);
  useEffect(() => {
    chartRef.current?.setOption(factory(), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, ...deps]);
  return ref;
}

/**
 * Usage 岛 —— 盈亏日历式三级下钻（年历 → 月历 → 日历）+ 日历/曲线切换 +
 * hover 显示 agent-model 消耗明细 + Agent 三开关。当日消耗用 24h 曲线呈现。
 */
export function UsagePage() {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [dayYm, setDayYm] = useState(todayYm()); // 日历视图当前月
  const [monY, setMonY] = useState(new Date().getFullYear()); // 月历视图当前年
  const [selectedDate, setSelectedDate] = useState(todayStr()); // 点日格选中的日期
  const [agent, setAgent] = useState<AgentFilter>('all');
  const [matrix, setMatrix] = useState<MatrixCell[] | null>(null);
  const [overview, setOverview] = useState<UsageOverview | null>(null);
  const [progress, setProgress] = useState<{ stage: string; done: number; total: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 采集进度事件
  useEffect(() => {
    let un: (() => void) | null = null;
    listen<{ stage: string; done: number; total: number }>('usage-collect-progress', (e) => {
      setProgress(e.payload);
      if (e.payload.done >= e.payload.total) {
        setTimeout(() => setProgress(null), 1200);
      }
    })
      .then((f) => {
        un = f;
      })
      .catch(() => {});
    return () => {
      un?.();
    };
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await usageCollect();
      setMatrix(await usageMatrix());
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 当前上下文的 overview range
  const overviewRange =
    granularity === 'day'
      ? `date:${selectedDate}`
      : granularity === 'month'
        ? `month:${dayYm}`
        : 'all';
  useEffect(() => {
    void usageOverview(overviewRange)
      .then(setOverview)
      .catch((e) => setError(String(e)));
  }, [overviewRange, matrix]);

  // agent 过滤后的聚合
  const filtered = useMemo(() => {
    const rows = (matrix ?? []).filter((c) => agent === 'all' || c.agent === agent);
    return buildBuckets(rows);
  }, [matrix, agent]);

  const totals = useMemo(() => {
    const list = (overview?.totals ?? []).filter((t) => agent === 'all' || t.agent === agent);
    const sum = (f: (t: (typeof list)[number]) => number) => list.reduce((a, t) => a + f(t), 0);
    return {
      calls: sum((t) => t.calls),
      input: sum((t) => t.input_tokens),
      cache: sum((t) => t.cache_read_tokens),
      all: sum((t) => t.input_tokens + t.output_tokens + t.cache_read_tokens),
      credit: sum((t) => t.credit),
    };
  }, [overview, agent]);

  // ── 日历模式渲染数据 ──
  const maxOfDay = Math.max(1, ...[...filtered.byDay.values()].map((b) => b.tokens));
  const maxOfMonth = Math.max(1, ...[...filtered.byMonth.values()].map((b) => b.tokens));
  const maxOfYear = Math.max(1, ...[...filtered.byYear.values()].map((b) => b.tokens));
  const years = useMemo(
    () => [...filtered.byYear.keys()].sort().reverse(),
    [filtered.byYear],
  );

  /** 日历格子（日粒度）：当月网格 */
  const dayCells = useMemo(() => {
    const [y, m] = dayYm.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const lead = (first.getDay() + 6) % 7; // 周一开头
    const days = new Date(y, m, 0).getDate();
    const cells: { day: number | null; date?: string }[] = [];
    for (let i = 0; i < lead; i += 1) cells.push({ day: null });
    for (let d = 1; d <= days; d += 1) {
      cells.push({ day: d, date: `${dayYm}-${String(d).padStart(2, '0')}` });
    }
    return cells;
  }, [dayYm]);

  const dayCard = (date: string): Bucket | undefined => filtered.byDay.get(date);

  // ── 曲线模式（echarts）：x = 时间（按天/按月/按年），堆叠柱 + hover 明细 ──
  const chartRef = useEChart(() => {
    const c = themeColors();
    const agents = agent === 'all' ? ['workbuddy', 'zcode'] : [agent];
    let cats: string[] = [];
    let seriesData: Record<string, number[]> = {};
    let title = '';
    if (granularity === 'day') {
      cats = dayCells.filter((x) => x.day).map((x) => x.date!);
      title = `按天用量 · ${dayYm}`;
      for (const a of agents) {
        seriesData[a] = cats.map((d) => {
          const b = filtered.byDay.get(d);
          if (!b) return 0;
          return b.details.filter((x) => x.agent === a).reduce((s, x) => s + x.tokens, 0);
        });
      }
    } else if (granularity === 'month') {
      cats = Array.from({ length: 12 }, (_, i) => `${monY}-${String(i + 1).padStart(2, '0')}`);
      title = `按月用量 · ${monY}`;
      for (const a of agents) {
        seriesData[a] = cats.map((ym) => {
          const b = filtered.byMonth.get(ym);
          if (!b) return 0;
          return b.details.filter((x) => x.agent === a).reduce((s, x) => s + x.tokens, 0);
        });
      }
    } else {
      cats = [...filtered.byYear.keys()].sort();
      title = '按年用量';
      for (const a of agents) {
        seriesData[a] = cats.map((y) => {
          const b = filtered.byYear.get(y);
          if (!b) return 0;
          return b.details.filter((x) => x.agent === a).reduce((s, x) => s + x.tokens, 0);
        });
      }
    }
    return {
      backgroundColor: 'transparent',
      title: { text: title, left: 12, top: 8, textStyle: { color: c.text2, fontSize: 12, fontWeight: 700 } },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: { axisValue: string; seriesName: string; value: number }[]) => {
          const key =
            granularity === 'day'
              ? ps[0]?.axisValue
              : granularity === 'month'
                ? ps[0]?.axisValue
                : ps[0]?.axisValue;
          const b =
            granularity === 'day'
              ? filtered.byDay.get(key)
              : granularity === 'month'
                ? filtered.byMonth.get(key)
                : filtered.byYear.get(key);
          const lines = (ps ?? []).map(
            (p) => `${p.seriesName}: ${fmtTok(p.value)} tok`,
          );
          const detail = detailText(b, agent)
            .split('\n')
            .map((l) => `<div style="opacity:.75">${l}</div>`)
            .join('');
          return `${ps[0]?.axisValue ?? ''}<br/>${lines.join('<br/>')}<br/>${detail}`;
        },
      },
      legend: { top: 8, right: 12, textStyle: { color: c.text2 } },
      grid: { left: 56, right: 20, top: 44, bottom: 28 },
      xAxis: {
        type: 'category',
        data: cats.map((x) => (granularity === 'day' ? x.slice(5) : x)),
        axisLabel: { color: c.text3 },
        axisLine: { lineStyle: { color: c.border } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: c.text3, formatter: (v: number) => fmtTok(v) },
        splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
      },
      series: agents.map((a) => ({
        name: AGENT_LABEL[a] ?? a,
        type: 'bar' as const,
        stack: 'total',
        data: seriesData[a] ?? [],
        itemStyle: { color: agentColor(a), borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 32,
      })),
    } satisfies echarts.EChartsCoreOption;
  }, [granularity, filtered, dayYm, monY, agent]);

  const granularityChip = (g: Granularity, label: string) => (
    <span
      key={g}
      className={`chip ${granularity === g ? 'ok' : 'off'}`}
      style={{ cursor: 'pointer', fontSize: 12, padding: '4px 14px' }}
      onClick={() => setGranularity(g)}
    >
      {label}
    </span>
  );

  const navLabel =
    granularity === 'day'
      ? dayYm
      : granularity === 'month'
        ? String(monY)
        : '全部年份';

  const navShift = (delta: number) => {
    if (granularity === 'day') setDayYm(shiftMonth(dayYm, delta));
    else if (granularity === 'month') setMonY((y) => y + delta);
  };

  return (
    <div>
      <PageHeader
        title="用量分析"
        sub="请求级真实 usage · 历史永久留存 ~/.agenthub（卸载双 Agent 后仍可查）· 正文永不入库"
      />

      {/* 首次全量提取进度条 */}
      {progress && progress.done < progress.total && (
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="flex items-center" style={{ gap: 10 }}>
            <span className="spinning" style={{ color: 'var(--color-primary)' }}>↻</span>
            <div style={{ fontSize: 12, color: 'var(--color-text-2)', flex: 'none' }}>
              正在提取本地用量数据（{progress.stage === 'zcode' ? 'ZCode 账本' : 'WorkBuddy 日志'} ·{' '}
              {progress.done}/{progress.total}）
            </div>
            <div style={{ flex: 1 }}>
              <div className="bar">
                <i style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 控制行：粒度 + 导航 + 视图切换 + Agent */}
      <div className="mb-3 flex items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12, color: 'var(--color-text-2)' }}>粒度</b>
        {granularityChip('day', '日')}
        {granularityChip('month', '月')}
        {granularityChip('year', '年')}
        {granularity !== 'year' && (
          <>
            <button className="btn gh" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => navShift(-1)}>
              ‹
            </button>
            <span
              className="chip off"
              style={{ fontFamily: 'Consolas, monospace', fontSize: 12, padding: '4px 14px' }}
            >
              {navLabel}
            </span>
            <button className="btn gh" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => navShift(1)}>
              ›
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        {refreshing && <span className="chip warn">采集中…</span>}
        <button className="btn gh" onClick={() => void refresh()} disabled={refreshing}>
          <span className={refreshing ? 'spinning' : ''} style={{ display: 'inline-block' }}>↻</span> 刷新
        </button>
        <span
          className={`chip ${viewMode === 'calendar' ? 'ok' : 'off'}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setViewMode('calendar')}
        >
          日历
        </span>
        <span
          className={`chip ${viewMode === 'chart' ? 'ok' : 'off'}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setViewMode('chart')}
        >
          曲线
        </span>
      </div>
      <div className="mb-3 flex items-center" style={{ gap: 8 }}>
        <b style={{ fontSize: 12, color: 'var(--color-text-2)' }}>Agent</b>
        {(
          [
            ['all', '汇总'],
            ['workbuddy', 'WorkBuddy'],
            ['zcode', 'ZCode'],
          ] as [AgentFilter, string][]
        ).map(([v, label]) => (
          <span
            key={v}
            className={`chip ${agent === v ? 'ok' : 'off'}`}
            style={{ cursor: 'pointer', fontSize: 11.5, padding: '4px 12px' }}
            onClick={() => setAgent(v)}
          >
            {label}
          </span>
        ))}
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

      {/* 四张统计卡（当前下钻上下文） */}
      <div className="mb-3 grid grid-cols-4 gap-2.5">
        <div className="stat">
          <div className="k">
            {agent === 'all' ? '双 Agent' : AGENT_LABEL[agent]} 合计
            <span className="chip ok" style={{ marginLeft: 2 }}>请求级真实</span>
          </div>
          <div className="v">{fmtTok(totals.all)}<small> tok</small></div>
          <div className="k">
            {granularity === 'day'
              ? selectedDate
              : granularity === 'month'
                ? dayYm
                : '全部'}
            {totals.credit > 0 && <> · 官方积分 {Math.round(totals.credit).toLocaleString()}</>}
          </div>
        </div>
        <div className="stat">
          <div className="k">调用次数</div>
          <div className="v">{totals.calls}<small> 次</small></div>
          <div className="k">请求级统计</div>
        </div>
        <div className="stat">
          <div className="k">输入 tok</div>
          <div className="v">{fmtTok(totals.input)}<small> tok</small></div>
          <div className="k">≈ ZCode 官方「累计 Token」口径</div>
        </div>
        <div className="stat">
          <div className="k">缓存命中</div>
          <div className="v" style={{ color: 'var(--color-ok)' }}>{fmtTok(totals.cache)}<small> tok</small></div>
          <div className="k">cache_read</div>
        </div>
      </div>

      {/* 主区：日历 或 曲线 */}
      {viewMode === 'calendar' ? (
        <div className="card" style={{ padding: 14, marginBottom: 12 }}>
          {/* 年历：年份格 */}
          {granularity === 'year' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-2)', marginBottom: 8 }}>
                年历 · 点击年份下钻到月历
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {years.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>暂无数据</div>
                )}
                {years.map((y) => {
                  const b = filtered.byYear.get(y);
                  return (
                    <div
                      key={y}
                      className="card hover-zoom"
                      style={{ padding: 12, cursor: 'pointer' }}
                      title={detailText(b, agent)}
                      onClick={() => {
                        setMonY(Number(y));
                        setGranularity('month');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <b style={{ fontSize: 14 }}>{y}</b>
                        <span className="chip off">{b?.calls ?? 0} 次</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Consolas, monospace', marginTop: 4 }}>
                        {fmtTok(b?.tokens ?? 0)} <small style={{ fontWeight: 400 }}>tok</small>
                      </div>
                      <div className="bar" style={{ marginTop: 6 }}>
                        <i style={{ width: `${((b?.tokens ?? 0) / maxOfYear) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* 月历：12 个月格 */}
          {granularity === 'month' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-2)', marginBottom: 8 }}>
                月历 · {monY} · 点击月份下钻到日历
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {Array.from({ length: 12 }, (_, i) => {
                  const ym = `${monY}-${String(i + 1).padStart(2, '0')}`;
                  const b = filtered.byMonth.get(ym);
                  return (
                    <div
                      key={ym}
                      className="card hover-zoom"
                      style={{
                        padding: 12,
                        cursor: 'pointer',
                        borderColor: b ? heatColor(b.tokens, maxOfMonth) : undefined,
                      }}
                      title={detailText(b, agent)}
                      onClick={() => {
                        setDayYm(ym);
                        setGranularity('day');
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <b style={{ fontSize: 13 }}>{i + 1} 月</b>
                        <span className="chip off">{b?.calls ?? 0} 次</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Consolas, monospace', marginTop: 4 }}>
                        {b ? fmtTok(b.tokens) : '—'}
                      </div>
                      <div className="bar" style={{ marginTop: 6 }}>
                        <i style={{ width: `${((b?.tokens ?? 0) / maxOfMonth) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* 日历：当月逐日格 */}
          {granularity === 'day' && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-2)', marginBottom: 8 }}>
                日历 · {dayYm} · 点击日期查看当日 24h 曲线（当前：{selectedDate}）
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
                  <div key={d} style={{ fontSize: 10.5, color: 'var(--color-text-3)', textAlign: 'center' }}>
                    周{d}
                  </div>
                ))}
                {dayCells.map((cell, i) => {
                  if (!cell.day) return <div key={`lead-${i}`} />;
                  const date = cell.date!;
                  const b = dayCard(date);
                  const isSel = date === selectedDate;
                  return (
                    <div
                      key={date}
                      className="hover-zoom"
                      title={detailText(b, agent)}
                      style={{
                        minHeight: 64,
                        borderRadius: 10,
                        padding: '6px 8px',
                        cursor: 'pointer',
                        background: heatColor(b?.tokens ?? 0, maxOfDay),
                        border: isSel ? '1.5px solid var(--color-primary-strong)' : '1px solid var(--color-border)',
                        color: b && b.tokens / maxOfDay > 0.35 ? '#fff' : 'var(--color-text-2)',
                      }}
                      onClick={() => {
                        setSelectedDate(date);
                        setViewMode('calendar');
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{cell.day}</div>
                      <div style={{ fontSize: 10.5, fontFamily: 'Consolas, monospace', marginTop: 2 }}>
                        {b ? fmtTok(b.tokens) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 8, marginBottom: 12 }}>
          <div ref={chartRef} style={{ width: '100%', height: 320 }} />
        </div>
      )}

      {/* 当日 24h 曲线（点日格后展示） */}
      {granularity === 'day' && selectedDate && overview?.curve && overview.curve.length > 0 && (
        <div className="card" style={{ padding: 8, marginBottom: 12 }}>
          <DayCurve overview={overview} date={selectedDate} />
        </div>
      )}

      {/* 按模型细分（当前上下文） */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 6 }}>
          按模型细分（Top 8 · {agent === 'all' ? '双 Agent' : AGENT_LABEL[agent]}）
        </div>
        <ModelBars overview={overview} agent={agent} />
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--color-text-3)', marginTop: 10 }}>
        · 日历格与曲线点悬浮显示 agent-model 消耗明细 · 点击年格→月历→日历逐级下钻 ·
        点日格切当日 24h 曲线 · 数据永久留存 ~/.agenthub
      </div>
    </div>
  );
}

/** 当日 24h 曲线（overview.curve 驱动） */
function DayCurve({ overview, date }: { overview: UsageOverview; date: string }) {
  const buckets = new Map<string, number[]>();
  for (const p of overview.curve) {
    const arr = buckets.get(p.agent) ?? new Array(48).fill(0);
    if (p.bucket >= 0 && p.bucket < 48) arr[p.bucket] = p.tokens;
    buckets.set(p.agent, arr);
  }
  const ref = useEChart(() => {
    const c = themeColors();
    const series = [...buckets.entries()].map(([a, arr]) => ({
      name: AGENT_LABEL[a] ?? a,
      type: 'line' as const,
      smooth: true,
      showSymbol: false,
      data: arr,
      lineStyle: { width: 2, color: agentColor(a) },
      itemStyle: { color: agentColor(a) },
      areaStyle: { opacity: 0.12 },
    }));
    return {
      backgroundColor: 'transparent',
      title: { text: `当日调用量分布 · ${date}（每 30min）`, left: 12, top: 8, textStyle: { color: c.text2, fontSize: 12, fontWeight: 700 } },
      tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${fmtTok(v)} tok` },
      legend: { top: 8, right: 12, textStyle: { color: c.text2 } },
      grid: { left: 56, right: 20, top: 44, bottom: 28 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`),
        axisLabel: { color: c.text3, interval: 5 },
        axisLine: { lineStyle: { color: c.border } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: c.text3, formatter: (v: number) => fmtTok(v) },
        splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
      },
      series,
    } satisfies echarts.EChartsCoreOption;
  }, [overview, date]);
  return <div ref={ref} style={{ width: '100%', height: 260 }} />;
}

/** 按模型细分（当前上下文 overview.models） */
function ModelBars({ overview, agent }: { overview: UsageOverview | null; agent: AgentFilter }) {
  const models = useMemo(
    () => (overview?.models ?? []).filter((m) => agent === 'all' || m.agent === agent),
    [overview, agent],
  );
  const ref = useEChart(() => {
    const c = themeColors();
    const sorted = [...models].sort((a, b) => b.tokens - a.tokens).slice(0, 8);
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${fmtTok(v)} tok` },
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: c.text3, formatter: (v: number) => fmtTok(v) },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: sorted.map((m) => m.model || '(unknown)'),
        axisLabel: { color: c.text2, fontFamily: 'Consolas, monospace', fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: sorted.map((m) => ({
            value: m.tokens,
            itemStyle: { color: agentColor(m.agent), borderRadius: [0, 4, 4, 0] },
          })),
          barMaxWidth: 14,
          label: {
            show: true,
            position: 'right',
            color: c.text3,
            fontFamily: 'Consolas, monospace',
            fontSize: 10.5,
            formatter: (p: { value: number }) => fmtTok(p.value),
          },
        },
      ],
    } satisfies echarts.EChartsCoreOption;
  }, [models]);
  return <div ref={ref} style={{ width: '100%', height: Math.max(160, (models.length || 1) * 34 + 40) }} />;
}
