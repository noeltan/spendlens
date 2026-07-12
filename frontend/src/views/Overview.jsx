import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CreditCard,
  MoreHorizontal,
  PieChart,
  RefreshCcw,
  ShoppingBag
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchBudget, fetchSummary, fetchSyncState, triggerSync } from '../api';
import { categoryMeta } from '../utils/categories';
import { formatCurrency } from '../utils/format';
import LoadingCard from '../components/LoadingCard';

const CARD_BAR_COLORS = ['#1558C0', '#D18A00', '#5C7CFA', '#0F766E', '#9333EA'];

function getElapsedDays(currentMonth) {
  const [year, month] = currentMonth.split('-').map(Number);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month - 1;
  return isCurrentMonth ? today.getDate() : new Date(year, month, 0).getDate();
}

function getCategoryEntries(byCategory) {
  return Object.entries(byCategory || {})
    .map(([name, total]) => ({ name, total: Number(total || 0) }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);
}

function CategoryDonutCard({ categories }) {
  if (!categories.length) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-[28px] border border-slate-200/85 bg-white p-8 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <div className="text-center">
          <PieChart className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No category activity yet</p>
        </div>
      </div>
    );
  }

  const legendItems = categories.slice(0, 4);
  const total = categories.reduce((sum, entry) => sum + entry.total, 0);
  const radius = 86;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-7">
      <div className="mb-6 flex items-start justify-between gap-3">
        <h2 className="mb-0 text-[17px] font-semibold text-slate-950">By Category</h2>
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400">
          <PieChart className="h-4 w-4" />
        </div>
      </div>

      <div className="flex flex-col items-center pt-2">
        <div className="relative mb-8 h-[200px] w-[200px]">
          <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
            <circle cx="110" cy="110" r={radius} fill="none" stroke="#E8EDF7" strokeWidth="24" />
            {categories.slice(0, 4).map((category) => {
              const ratio  = category.total / total;
              const length = circumference * ratio;
              const dashArray = `${length} ${circumference - length}`;
              const strokeDashoffset = -offset;
              offset += length;
              return (
                <circle
                  key={category.name}
                  cx="110" cy="110" r={radius}
                  fill="none"
                  stroke={categoryMeta(category.name).color}
                  strokeWidth="24"
                  strokeLinecap="butt"
                  strokeDasharray={dashArray}
                  strokeDashoffset={strokeDashoffset}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Total</span>
            <span className="text-[22px] font-semibold text-slate-900">{formatCurrency(total, 0)}</span>
          </div>
        </div>

        {/* Legend — 2-col grid on mobile for compactness */}
        <div className="w-full grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-1 sm:gap-y-3">
          {legendItems.map((category) => (
            <div key={category.name} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryMeta(category.name).color }}
                />
                <span className="truncate font-medium text-slate-700">
                  {category.name}
                  <span className="ml-1 text-slate-400">
                    ({Math.round((category.total / total) * 100)}%)
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MerchantRow({ merchant }) {
  const meta = categoryMeta(merchant.category);
  const Icon = meta.icon;

  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${meta.bgClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-slate-950">{merchant.merchant}</h3>
          <p className="truncate text-sm text-slate-500">
            {merchant.category || 'Other'} • {merchant.count || 1} {merchant.count === 1 ? 'Transaction' : 'Transactions'}
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[16px] font-semibold text-slate-950">{formatCurrency(merchant.total)}</p>
        {merchant.changePct != null ? (
          <p className={`text-sm font-semibold ${merchant.changePct > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {merchant.changePct > 0 ? '↑' : '↓'} {Math.abs(merchant.changePct)}%
          </p>
        ) : (
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Static</p>
        )}
      </div>
    </div>
  );
}

export default function Overview({ currentMonth, viewBy }) {
  const [summary,      setSummary]      = useState(null);
  const [budget,       setBudget]       = useState({});
  const [syncState,    setSyncState]    = useState(null);
  const [syncing,      setSyncing]      = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [error,        setError]        = useState(null);
  const syncingRef = useRef(false);
  const pollRef    = useRef(null);

  async function load() {
    try {
      const [s, b, ss] = await Promise.all([
        fetchSummary(currentMonth, viewBy).catch(() => ({ totalSpend: 0, byCard: {}, byCategory: {}, topMerchants: [] })),
        fetchBudget(currentMonth).catch(() => ({})),
        fetchSyncState().catch(() => null)
      ]);
      setSummary(s);
      setBudget(b);
      setSyncState(ss);
      return ss;
    } catch (err) {
      console.error(err);
      setError('Failed to load data.');
      return null;
    }
  }

  useEffect(() => {
    load().then((ss) => {
      if (syncingRef.current) return;
      if (!ss || !ss.lastSyncedAt) {
        handleSync();
      } else {
        const hoursSince = (Date.now() - new Date(ss.lastSyncedAt)) / 3600000;
        if (hoursSince > 6) handleSync();
      }
    });
  }, [currentMonth, viewBy]);

  async function handleSync() {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncProgress(null);
    setError(null);

    try {
      await triggerSync();
      await new Promise((resolve) => {
        pollRef.current = setInterval(async () => {
          try {
            const ss = await fetchSyncState();
            const prog = ss?.progress ?? null;
            setSyncProgress(prog);
            if (prog === null) { clearInterval(pollRef.current); resolve(); }
          } catch (_) {}
        }, 2000);
      });
      await load();
    } catch (err) {
      setError('Failed to sync inbox.');
    }

    if (pollRef.current) clearInterval(pollRef.current);
    setSyncProgress(null);
    syncingRef.current = false;
    setSyncing(false);
  }

  function timeSince(isoString) {
    if (!isoString) return 'Never synced';
    const mins = Math.floor((Date.now() - new Date(isoString)) / 60000);
    if (mins < 1)  return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  if (error) {
    return (
      <div className="page-outer page-content">
        <div className="mx-auto max-w-xl rounded-3xl border border-red-100 bg-red-50 p-6 text-center text-red-600">
          <AlertCircle className="mx-auto mb-4 h-12 w-12" />
          <p className="mb-2 font-bold text-red-700">Sync Error</p>
          <p className="mb-4 text-sm text-red-600">{error}</p>
          <button onClick={() => window.location.reload()} className="rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white border-0">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!summary) {
    return <LoadingCard label="Loading Dashboard" />;
  }

  const budgetLimit  = Number(budget.overall || 0);
  const hasBudget    = budgetLimit > 0;
  const totalSpend   = Number(summary.totalSpend || 0);
  const usedPct      = hasBudget ? Math.round((totalSpend / budgetLimit) * 100) : 0;
  const remaining    = Math.max(0, budgetLimit - totalSpend);
  const daysElapsed  = Math.max(1, getElapsedDays(currentMonth));
  const dailyAverage = totalSpend / daysElapsed;
  const monthLabel   = new Date(`${currentMonth}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const categoryEntries = getCategoryEntries(summary.byCategory);
  const topCards = Object.entries(summary.byCard || {})
    .map(([name, total]) => ({ name, total: Number(total || 0) }))
    .filter((card) => card.total > 0)
    .sort((a, b) => b.total - a.total);
  const topMerchants = (summary.topMerchants || []).slice(0, 3);

  return (
    <div className="page-outer page-content">
      <div className="flex w-full flex-col gap-6 lg:gap-8">

        {/* ── Row 1: Heading (desktop only) + Sync card ─────────────── */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
          {/* Heading — hidden on mobile, visible on desktop */}
          <div className="hidden lg:block">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.22em] text-slate-400">Overview</p>
            <h1 className="mb-2 text-[38px] font-semibold leading-none text-slate-950 sm:text-[48px]">Financial Lens</h1>
            <p className="max-w-2xl text-lg text-slate-600">Real-time overview of your capital flows.</p>
          </div>

          {/* Sync status card */}
          <div className="rounded-[24px] border border-slate-200/85 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Connection Status</p>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${syncing ? 'animate-pulse bg-blue-500' : 'bg-emerald-400'}`} />
                <span className="text-[15px] font-semibold text-slate-900">
                  {syncing
                    ? (syncProgress
                        ? (syncProgress.stage === 'fetching' ? 'Reading Gmail…' : `Processing ${syncProgress.current}/${syncProgress.total}`)
                        : 'Syncing…')
                    : `Last synced ${timeSince(syncState?.lastSyncedAt)}`}
                </span>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex h-10 items-center gap-2 rounded-xl border-0 bg-blue-600 px-5 text-sm font-semibold text-white shadow-md shadow-blue-100 transition-transform active:scale-[0.97] disabled:opacity-60"
              >
                <RefreshCcw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing' : 'Sync Now'}
              </button>
            </div>
          </div>
        </section>

        {/* ── Main content grid ─────────────────────────────────────────
            Mobile order (single column):
              1. Budget card
              2. Spending by Card
              3. Category Donut
              4. Top Merchants
            Desktop order (2 columns):
              col-1 row-1: Budget  |  col-2 row-1: Donut
              col-1 row-2: Cards   |  col-2 row-2: Merchants
        ─────────────────────────────────────────────────────────────── */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">

          {/* 1 — Monthly Budget (mobile: order-1, desktop: col-1 row-1) */}
          <div className="order-1 xl:col-start-1 xl:row-start-1 rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
            {/* Header: title + badge (badge visible on mobile only) */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="mb-1 text-[18px] font-semibold text-slate-950">Monthly Budget</h2>
                <p className="text-sm text-slate-500">{monthLabel}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Badge — visible on mobile, hidden on xl */}
                {hasBudget && (
                  <span className="inline-flex xl:hidden rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700">
                    {usedPct}% Used
                  </span>
                )}
                <button className="hidden lg:flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Amount row: amount + badge (badge visible on desktop only) */}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
                {/* Blue on mobile, dark on desktop */}
                <h3 className="mb-0 text-[44px] font-semibold leading-none text-blue-600 xl:text-slate-950 sm:text-[52px]">
                  {formatCurrency(totalSpend, 0)}
                </h3>
                {hasBudget && <p className="pb-1 text-[17px] text-slate-500">of {formatCurrency(budgetLimit, 0)}</p>}
              </div>
              {/* Badge — hidden on mobile, visible on xl */}
              {hasBudget && (
                <span className="hidden xl:inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                  {usedPct}% Used
                </span>
              )}
            </div>

            {hasBudget ? (
              <>
                {/* Progress bar */}
                <div className="mb-8 h-4 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-700"
                    style={{ width: `${Math.min(usedPct, 100)}%` }}
                  />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[18px] bg-slate-50 px-4 py-4">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Remaining</p>
                    <p className="text-[28px] font-semibold leading-none text-slate-950">{formatCurrency(remaining, 0)}</p>
                  </div>
                  <div className="rounded-[18px] bg-slate-50 px-4 py-4">
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Avg. Daily</p>
                    <p className="text-[28px] font-semibold leading-none text-slate-950">{formatCurrency(dailyAverage, 0)}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-[20px] bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="mb-1 text-[15px] font-semibold text-slate-900">No budget set for this month</p>
                  <p className="text-sm text-slate-500">Set a monthly budget to track how much you have left to spend.</p>
                </div>
                <Link
                  to="/config"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-100"
                >
                  Set Budget
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>

          {/* 2 — Spending by Card (mobile: order-2, desktop: col-1 row-2) */}
          <div className="order-2 xl:col-start-1 xl:row-start-2 rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <h2 className="mb-0 text-[18px] font-semibold text-slate-950">Spending by Card</h2>
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400">
                <CreditCard className="h-4 w-4" />
              </div>
            </div>

            <div className="space-y-6">
              {topCards.length ? topCards.slice(0, 4).map((card, index) => {
                const maxSpend = topCards[0]?.total || 1;
                const width = `${Math.max(16, Math.round((card.total / maxSpend) * 100))}%`;
                return (
                  <div key={card.name}>
                    <div className="mb-2.5 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="inline-flex min-w-[48px] items-center justify-center rounded-md px-2 py-1 text-[11px] font-black uppercase text-white"
                          style={{ backgroundColor: CARD_BAR_COLORS[index % CARD_BAR_COLORS.length] }}
                        >
                          {card.name.slice(0, 4)}
                        </span>
                        <span className="truncate text-[15px] font-medium text-slate-800">{card.name}</span>
                      </div>
                      <span className="shrink-0 text-[15px] font-semibold text-slate-950">{formatCurrency(card.total)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width, backgroundColor: CARD_BAR_COLORS[index % CARD_BAR_COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              }) : (
                <div className="flex min-h-[160px] items-center justify-center rounded-[20px] bg-slate-50 text-center">
                  <div>
                    <CreditCard className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">No card activity yet.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3 — Category Donut (mobile: order-3, desktop: col-2 row-1) */}
          <div className="order-3 xl:col-start-2 xl:row-start-1">
            <CategoryDonutCard categories={categoryEntries} />
          </div>

          {/* 4 — Top Merchants (mobile: order-4, desktop: col-2 row-2) */}
          <div className="order-4 xl:col-start-2 xl:row-start-2 rounded-[28px] border border-slate-200/85 bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="mb-0 text-[18px] font-semibold text-slate-950">Top Merchants</h2>
              <Link to="/transactions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600">
                View All
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {topMerchants.length ? topMerchants.map((merchant, index) => (
                <MerchantRow key={`${merchant.merchant}-${index}`} merchant={merchant} />
              )) : (
                <div className="flex min-h-[160px] items-center justify-center rounded-[20px] bg-slate-50 text-center">
                  <div>
                    <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">No merchants recorded yet.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

        </section>
      </div>

    </div>
  );
}
