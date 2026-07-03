import { useEffect, useMemo, useRef, useState } from 'react';
import { Landmark, PiggyBank, RefreshCcw, Save, TrendingUp, Wallet } from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { fetchRetirement, fetchSummary, saveRetirement, saveRetirementSnapshot } from '../api';
import {
  computeRetire, fmtCompact, fmtSGD, NW_FIELDS, PLAN_DEFAULTS, PLAN_FIELDS
} from '../utils/retirement';

function InputRow({ field, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{field.label}</span>
        {field.hint && <span className="text-xs text-slate-400">{field.hint}</span>}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        placeholder="0"
        value={value ?? ''}
        onChange={(e) => onChange(field.k, e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[15px] font-medium text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white"
      />
    </label>
  );
}

function etaMessage(summary, plan) {
  if (summary.targetNow <= 0 || !plan.age) {
    return { tone: 'neutral', text: 'Fill in your plan and net worth below to see your projection.' };
  }
  if (summary.readyAge === null) {
    return {
      tone: 'bad',
      text: 'Not projected to reach your target by age 90 at the current savings rate. Try raising monthly investing or lowering planned retirement spending.'
    };
  }
  if (summary.readyAge <= plan.retireAge) {
    const ahead = plan.retireAge - summary.readyAge;
    return {
      tone: 'good',
      text: `On track — projected to hit your target by age ${summary.readyAge}` +
        (ahead > 0 ? `, ${ahead} year${ahead !== 1 ? 's' : ''} ahead of your goal of ${plan.retireAge}.` : ', right on your goal.')
    };
  }
  const late = summary.readyAge - plan.retireAge;
  return {
    tone: 'warn',
    text: `Projected to reach your target at age ${summary.readyAge} — ${late} year${late !== 1 ? 's' : ''} past your goal of ${plan.retireAge}. Raising monthly investing closes the gap fastest.`
  };
}

const TONE_CLASSES = {
  good:    'border-emerald-100 bg-emerald-50 text-emerald-700',
  warn:    'border-amber-100 bg-amber-50 text-amber-700',
  bad:     'border-red-100 bg-red-50 text-red-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600'
};

export default function Retirement({ currentMonth, viewBy }) {
  const [plan, setPlan] = useState(PLAN_DEFAULTS);
  const [nw, setNw] = useState({});
  const [snapshots, setSnapshots] = useState([]);
  const [monthSpend, setMonthSpend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const saveTimer = useRef(null);
  const loaded = useRef(false);

  useEffect(() => {
    Promise.all([
      fetchRetirement().catch(() => ({ plan: {}, nw: {}, snapshots: [] })),
      fetchSummary(currentMonth, viewBy).catch(() => ({ totalSpend: 0 }))
    ]).then(([r, s]) => {
      setPlan({ ...PLAN_DEFAULTS, ...(r.plan || {}) });
      setNw(r.nw || {});
      setSnapshots(r.snapshots || []);
      setMonthSpend(Number(s.totalSpend || 0));
      setLoading(false);
      loaded.current = true;

      // Auto-snapshot once per month so the history chart builds itself
      const thisMonth = new Date().toISOString().substring(0, 7);
      const hasThisMonth = (r.snapshots || []).some((snap) => snap.date.startsWith(thisMonth));
      const { summary: current } = computeRetire({ plan: r.plan || {}, nw: r.nw || {} });
      if (!hasThisMonth && current.netWorth !== 0) {
        saveRetirementSnapshot({
          date: new Date().toISOString().split('T')[0],
          netWorth: current.netWorth,
          retireAssets: current.retireAssetsNow
        }).then((res) => setSnapshots(res.snapshots || [])).catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    fetchSummary(currentMonth, viewBy)
      .then((s) => setMonthSpend(Number(s.totalSpend || 0)))
      .catch(() => {});
  }, [currentMonth, viewBy]);

  // Debounced persistence of plan + net worth edits
  useEffect(() => {
    if (!loaded.current) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveRetirement({ plan, nw }).catch(() => {});
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [plan, nw]);

  const { summary, points } = useMemo(() => computeRetire({ plan, nw }), [plan, nw]);
  const eta = etaMessage(summary, plan);
  const pct = summary.targetNow > 0 ? Math.max(0, (summary.retireAssetsNow / summary.targetNow) * 100) : 0;

  const chartData = useMemo(() => {
    if (!points.length) return [];
    const shortfallAges = points.filter((pt) => pt.assets < pt.target).map((pt) => pt.age);
    const endAge = Math.min(90, Math.max(plan.retireAge || 0, ...shortfallAges, plan.age + 20) + 5);
    return points.filter((pt) => pt.age <= endAge);
  }, [points, plan.age, plan.retireAge]);

  function updatePlan(key, raw) {
    setPlan((prev) => ({ ...prev, [key]: raw === '' ? '' : Number(raw) }));
  }
  function updateNw(key, raw) {
    setNw((prev) => ({ ...prev, [key]: raw === '' ? '' : Number(raw) }));
  }

  async function handleSnapshot() {
    setSaving(true);
    try {
      await saveRetirement({ plan, nw });
      const res = await saveRetirementSnapshot({
        date: new Date().toISOString().split('T')[0],
        netWorth: summary.netWorth,
        retireAssets: summary.retireAssetsNow
      });
      setSnapshots(res.snapshots || []);
      setToast('Net worth snapshot saved');
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setToast('Failed to save snapshot');
      setTimeout(() => setToast(''), 3000);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="page-outer page-content">
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-3xl border border-slate-100 bg-white">
          <RefreshCcw className="h-12 w-12 animate-spin text-blue-600" />
          <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Loading Retirement Plan</p>
        </div>
      </div>
    );
  }

  const income = Number(plan.income) || 0;
  const spend = monthSpend ?? 0;
  const savings = income - spend;
  const savingsRate = income > 0 ? (savings / income) * 100 : null;

  return (
    <div className="page-outer page-content">
      <div className="flex w-full flex-col gap-6 lg:gap-8">

        {/* Heading */}
        <div className="hidden lg:block">
          <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.22em] text-slate-400">Retirement</p>
          <h1 className="mb-2 text-[38px] font-semibold leading-none text-slate-950 sm:text-[48px]">Retirement Lens</h1>
          <p className="max-w-2xl text-lg text-slate-600">How far you are from your retirement goal, and when you'll get there.</p>
        </div>

        {/* Hero: progress to target */}
        <section className="rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="mb-1 text-[18px] font-semibold text-slate-950">Progress to Target</h2>
              <p className="text-sm text-slate-500">
                Target {summary.targetNow > 0 ? `${fmtSGD(summary.targetNow)} (today's $)` : '—'}
              </p>
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>

          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <h3 className="mb-0 text-[44px] font-semibold leading-none text-blue-600 sm:text-[52px]">
                {summary.targetNow > 0 ? `${Math.min(999, pct).toFixed(0)}%` : '—'}
              </h3>
              <p className="pb-1 text-[17px] text-slate-500">of your retirement target</p>
            </div>
            <span className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
              {fmtSGD(summary.retireAssetsNow)} retirement assets
            </span>
          </div>

          <div className="mb-6 h-4 overflow-hidden rounded-full bg-slate-200/80">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-700"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>

          <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-medium ${TONE_CLASSES[eta.tone]}`}>
            {eta.text}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Net Worth</p>
              <p className="text-[28px] font-semibold leading-none text-slate-950">{fmtCompact(summary.netWorth)}</p>
            </div>
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Ready Age</p>
              <p className="text-[28px] font-semibold leading-none text-slate-950">{summary.readyAge ?? '—'}</p>
            </div>
          </div>
        </section>

        {/* This month: income vs spend vs savings rate */}
        <section className="rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
          <div className="mb-6 flex items-start justify-between gap-3">
            <h2 className="mb-0 text-[18px] font-semibold text-slate-950">This Month</h2>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Income</p>
              <p className="text-[24px] font-semibold leading-none text-slate-950">{income > 0 ? fmtSGD(income) : '—'}</p>
            </div>
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Spend</p>
              <p className="text-[24px] font-semibold leading-none text-slate-950">{fmtSGD(spend)}</p>
            </div>
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Est. Savings</p>
              <p className="text-[24px] font-semibold leading-none text-slate-950">{income > 0 ? fmtSGD(savings) : '—'}</p>
            </div>
            <div className="rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Savings Rate</p>
              <p className={`text-[24px] font-semibold leading-none ${
                savingsRate === null ? 'text-slate-950'
                  : savingsRate >= 20 ? 'text-emerald-600'
                  : savingsRate >= 0 ? 'text-slate-950'
                  : 'text-red-500'
              }`}>
                {savingsRate === null ? '—' : `${savingsRate.toFixed(0)}%`}
              </p>
            </div>
          </div>
        </section>

        {/* Projection chart */}
        <section className="rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
          <h2 className="mb-6 text-[18px] font-semibold text-slate-950">Projection</h2>
          {chartData.length ? (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF7" />
                  <XAxis dataKey="age" tick={{ fontSize: 12, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip
                    formatter={(value, name) => [fmtSGD(value), name]}
                    labelFormatter={(age) => `Age ${age}`}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Area type="monotone" dataKey="assets" name="Projected assets" stroke="#1558C0" strokeWidth={2} fill="#1558C0" fillOpacity={0.08} />
                  <Area type="monotone" dataKey="target" name="Target" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="5 5" fill="none" fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-[20px] bg-slate-50 text-center">
              <p className="text-sm font-medium text-slate-500">Enter your age and plan details to see the projection.</p>
            </div>
          )}
        </section>

        {/* Inputs: plan + net worth */}
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-3">
              <h2 className="mb-0 text-[18px] font-semibold text-slate-950">Your Plan</h2>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400">
                <PiggyBank className="h-4 w-4" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {PLAN_FIELDS.map((f) => (
                <InputRow key={f.k} field={f} value={plan[f.k]} onChange={updatePlan} />
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div>
                <h2 className="mb-1 text-[18px] font-semibold text-slate-950">Net Worth</h2>
                <p className="text-sm text-slate-500">
                  {snapshots.length
                    ? `${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''} saved · last on ${snapshots[snapshots.length - 1].date}`
                    : 'Snapshots build your net-worth history over time.'}
                </p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400">
                <Landmark className="h-4 w-4" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {NW_FIELDS.map((f) => (
                <InputRow key={f.k} field={f} value={nw[f.k]} onChange={updateNw} />
              ))}
            </div>
            <button
              onClick={handleSnapshot}
              disabled={saving}
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl border-0 bg-blue-600 px-5 text-sm font-semibold text-white shadow-md shadow-blue-100 transition-transform active:scale-[0.97] disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Snapshot'}
            </button>
          </div>
        </section>

        {/* Net worth history */}
        {snapshots.length >= 2 && (
          <section className="rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
            <h2 className="mb-6 text-[18px] font-semibold text-slate-950">Net Worth History</h2>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={snapshots} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF7" />
                  <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 12, fill: '#94A3B8' }} tickLine={false} axisLine={false} width={56} />
                  <Tooltip
                    formatter={(value, name) => [fmtSGD(value), name]}
                    contentStyle={{ borderRadius: 12, border: '1px solid #E2E8F0', fontSize: 13 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Line type="monotone" dataKey="netWorth" name="Net worth" stroke="#1558C0" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="retireAssets" name="Retirement assets" stroke="#0F766E" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-24 left-1/2 z-[200] -translate-x-1/2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-lg lg:bottom-8">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
