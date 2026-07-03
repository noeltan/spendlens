import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bus,
  ChevronDown,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  MoreHorizontal,
  Plane,
  Receipt,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Wallet
} from 'lucide-react';
import { fetchConfig, fetchTransactions } from '../api';

const CATEGORY_ICONS = {
  Dining: <Utensils className="h-5 w-5" />,
  Groceries: <ShoppingBag className="h-5 w-5" />,
  Transport: <Bus className="h-5 w-5" />,
  Shopping: <ShoppingCart className="h-5 w-5" />,
  Bills: <Receipt className="h-5 w-5" />,
  Health: <HeartPulse className="h-5 w-5" />,
  Travel: <Plane className="h-5 w-5" />,
  Entertainment: <Gamepad2 className="h-5 w-5" />,
  Education: <GraduationCap className="h-5 w-5" />,
  Income: <Wallet className="h-5 w-5" />,
  Other: <MoreHorizontal className="h-5 w-5" />
};

const CATEGORY_COLORS = {
  Dining: 'bg-indigo-50 text-indigo-700',
  Groceries: 'bg-slate-100 text-blue-700',
  Transport: 'bg-blue-50 text-blue-700',
  Shopping: 'bg-violet-50 text-violet-700',
  Bills: 'bg-rose-50 text-rose-600',
  Health: 'bg-pink-50 text-pink-600',
  Travel: 'bg-sky-50 text-sky-700',
  Entertainment: 'bg-purple-50 text-purple-700',
  Education: 'bg-amber-50 text-amber-700',
  Income: 'bg-emerald-50 text-emerald-700',
  Other: 'bg-slate-100 text-slate-600'
};

function formatCurrency(value) {
  return `$${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatMonthTitle(currentMonth, viewBy) {
  const date = new Date(`${currentMonth}-01T00:00:00`);
  const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return viewBy === 'billing' ? `${label} billing cycle` : label;
}

function TransactionRow({ item }) {
  const amount = Number(item.amountLocal || item.amount || 0);
  const isCredit = amount < 0;
  const displayAmount = Math.abs(amount);
  const title = item.description || item.merchant || 'Untitled transaction';
  const meta = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;
  const icon = CATEGORY_ICONS[item.category] || <MoreHorizontal className="h-5 w-5" />;
  const isForeign = item.isLocal === false && item.currency;

  return (
    <div className="rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition-transform active:scale-[0.995] sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${meta}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold text-slate-950">{title}</h3>
            <p className="mt-1 truncate text-[15px] text-slate-500">{item.card || item.category || 'Unassigned'}</p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <p className={`text-[18px] font-semibold ${isCredit ? 'text-emerald-600' : 'text-slate-950'}`}>
            {isCredit ? '+' : '-'}{formatCurrency(displayAmount)}
          </p>
          {isForeign && (
            <p className="mt-1 text-sm text-slate-400">
              {item.currency} {Number(item.amount || 0).toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Transactions({ currentMonth, viewBy }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cardFilter, setCardFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [cardOptions, setCardOptions] = useState(['All']);

  useEffect(() => {
    fetchConfig().then((cfg) => {
      const names = (cfg?.cards || []).map((c) => c.name).filter(Boolean);
      setCardOptions(['All', ...names]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTransactions(currentMonth, viewBy)
      .then(setTransactions)
      .catch((err) => console.error('Failed to load transactions', err))
      .finally(() => setLoading(false));
  }, [currentMonth, viewBy]);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => cardFilter === 'All' || t.card === cardFilter || t.card?.includes(cardFilter))
      .filter((t) => categoryFilter === 'All' || t.category === categoryFilter)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions, cardFilter, categoryFilter]);

  const totalFiltered = filtered.reduce((sum, t) => sum + Math.abs(Number(t.amountLocal || t.amount || 0)), 0);

  const groups = filtered.reduce((acc, t) => {
    const dateLabel = new Date(t.date)
      .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      .toUpperCase();
    if (!acc[dateLabel]) acc[dateLabel] = { date: dateLabel, total: 0, items: [] };
    acc[dateLabel].items.push(t);
    acc[dateLabel].total += Math.abs(Number(t.amountLocal || t.amount || 0));
    return acc;
  }, {});

  const groupList = Object.values(groups);

  return (
    <div className="page-outer page-content">
      <div className="flex w-full flex-col gap-8 lg:gap-9">
        <section className="rounded-[28px] bg-[linear-gradient(135deg,#1f6fe5_0%,#327de6_100%)] p-7 shadow-[0_18px_40px_rgba(37,99,235,0.22)] lg:p-8">
          <div className="max-w-3xl">
            <p className="mb-3 text-[12px] font-bold uppercase tracking-[0.24em] text-blue-100">This Month&apos;s Spend</p>
            <h1 className="mb-2 text-[42px] font-semibold leading-none text-white sm:text-[52px]">
              {formatCurrency(totalFiltered)}
            </h1>
            <p className="mb-6 text-base text-blue-100">{formatMonthTitle(currentMonth, viewBy)}</p>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
                <ArrowUpRight className="h-4 w-4" />
                {filtered.length} transactions in view
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="mb-0 text-[18px] font-semibold text-slate-950">Filters</h2>
            <button
              onClick={() => {
                setCardFilter('All');
                setCategoryFilter('All');
              }}
              className="w-full border-0 bg-transparent px-0 py-0 text-sm font-semibold text-blue-600 hover:bg-transparent sm:w-auto"
            >
              Reset
            </button>
          </div>

          <div className="grid gap-4 lg:max-w-[620px] lg:grid-cols-[290px_290px]">
            <div className="relative">
              <select
                value={cardFilter}
                onChange={(e) => setCardFilter(e.target.value)}
                className="h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-[15px] font-medium text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-100"
              >
                {cardOptions.map((card) => (
                  <option key={card} value={card}>
                    {card === 'All' ? 'All Cards' : card}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>

            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 pr-10 text-[15px] font-medium text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="All">Categories</option>
                {Object.keys(CATEGORY_ICONS).map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </section>

        <main className="min-h-[320px] space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-slate-200/80 bg-white p-12 text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <RotateCcw className="h-8 w-8 animate-spin" />
              <p className="text-sm font-medium">Loading records...</p>
            </div>
          ) : groupList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-slate-200/80 bg-white p-12 text-slate-400 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                <Receipt className="h-8 w-8" />
              </div>
              <p className="text-sm font-medium">No transactions found</p>
            </div>
          ) : (
            groupList.map((group) => (
              <section key={group.date} className="animate-in">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="mb-0 text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {group.date}
                  </h3>
                  <span className="text-[12px] font-semibold text-slate-500">{formatCurrency(group.total)}</span>
                </div>

                <div className="grid gap-4">
                  {group.items.map((item, index) => (
                    <TransactionRow key={item.id || `${group.date}-${index}`} item={item} />
                  ))}
                </div>
              </section>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
