import React, { useState, useEffect } from 'react';
import { ChevronDown, CreditCard, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { fetchBudget, saveBudget, fetchConfig, saveConfig, triggerSync } from '../api';
import { CATEGORIES } from '../utils/categories';
import LoadingCard from '../components/LoadingCard';
import Toast, { useToast } from '../components/Toast';

const SYNC_PERIODS = [3, 6, 9, 12];
const BANKS = ['DBS', 'SCB', 'Citibank', 'UOB', 'HSBC', 'Maybank', 'AMEX'];

export default function Config({ currentMonth }) {
  const [activeTab, setActiveTab] = useState('general');
  const [budgetForm, setBudgetForm] = useState({ overall: '', byCard: {}, byCategory: {} });
  const [configForm, setConfigForm] = useState({ syncPeriodMonths: 3, localCurrency: 'SGD', cards: [] });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [syncingCardId, setSyncingCardId] = useState(null);
  const [confirmResyncId, setConfirmResyncId] = useState(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchBudget(currentMonth).catch(() => ({})),
      fetchConfig().catch(() => ({ syncPeriodMonths: 3, localCurrency: 'SGD', cards: [] }))
    ]).then(([b, c]) => {
      setBudgetForm(b && Object.keys(b).length > 0 ? b : { overall: '', byCard: {}, byCategory: {} });
      setConfigForm({
        syncPeriodMonths: c?.syncPeriodMonths || 3,
        localCurrency: c?.localCurrency || 'SGD',
        cards: c?.cards || []
      });
    }).finally(() => setLoading(false));
  }, [currentMonth]);

  function updateCard(id, field, value) {
    setConfigForm(f => ({
      ...f,
      cards: f.cards.map(c => c.id === id ? { ...c, [field]: value } : c)
    }));
  }

  function addCard() {
    const newCard = { id: crypto.randomUUID(), name: '', bank: 'DBS', startDay: 11 };
    setConfigForm(f => ({ ...f, cards: [...f.cards, newCard] }));
  }

  function removeCard(id) {
    setConfigForm(f => ({ ...f, cards: f.cards.filter(c => c.id !== id) }));
  }

  async function handleSave() {
    setSaved(false);
    try {
      // Save both tabs so edits on the inactive tab are never silently lost
      await Promise.all([
        saveBudget(currentMonth, { ...budgetForm, overall: Number(budgetForm.overall) }),
        saveConfig({
          syncPeriodMonths: Number(configForm.syncPeriodMonths),
          localCurrency: configForm.localCurrency || 'SGD',
          cards: configForm.cards
        })
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      showToast(`Failed to save: ${err.message}`);
    }
  }

  async function handleResyncCard(card) {
    if (confirmResyncId !== card.id) {
      setConfirmResyncId(card.id);
      setTimeout(() => setConfirmResyncId((id) => (id === card.id ? null : id)), 4000);
      return;
    }
    setConfirmResyncId(null);
    setSyncingCardId(card.id);
    try {
      await triggerSync({ cardId: card.id });
      showToast(`Re-syncing ${card.name || 'card'} — check Overview for progress`);
    } catch (err) {
      showToast(`Sync failed: ${err.message}`);
    } finally {
      setSyncingCardId(null);
    }
  }

  if (loading) {
    return <LoadingCard label="Loading Settings" />;
  }

  return (
    <div className="page-outer page-content">
      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="mb-2 text-3xl font-black text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500">Manage cards, sync preferences, and monthly budget rules.</p>
          </div>
          <button
            onClick={handleSave}
            className={`w-full rounded-2xl px-6 py-3 text-sm font-black text-white shadow-xl transition-all active:scale-[0.98] sm:w-auto ${saved ? 'bg-green-500 shadow-green-100' : 'bg-blue-600 shadow-blue-100'}`}
          >
            {saved ? 'Changes Saved ✓' : 'Save Changes'}
          </button>
        </div>

        <div className="flex w-full gap-2 rounded-2xl bg-slate-200/50 p-1 sm:w-fit">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${activeTab === 'general' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('budget')}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${activeTab === 'budget' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200'}`}
          >
            Budget
          </button>
        </div>

        {activeTab === 'general' ? (
          <div className="grid gap-8 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.18fr)]">
            <section className="rounded-3xl border border-slate-100 bg-white shadow-sm animate-in">
              <div className="border-b border-slate-50 p-6 font-bold text-slate-900">General Preferences</div>
              <div className="grid gap-6 p-6 md:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Base Currency</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={configForm.localCurrency}
                    onChange={e => setConfigForm(f => ({ ...f, localCurrency: e.target.value.toUpperCase() }))}
                    className="h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sync Window (Months)</label>
                  <div className="relative">
                    <select
                      value={configForm.syncPeriodMonths}
                      onChange={e => setConfigForm(f => ({ ...f, syncPeriodMonths: Number(e.target.value) }))}
                      className="h-14 w-full appearance-none rounded-2xl border border-slate-100 bg-slate-50 px-4 pr-10 text-sm font-bold text-slate-700 outline-none"
                    >
                      {SYNC_PERIODS.map(m => <option key={m} value={m}>{m} Months</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white shadow-sm animate-in">
              <div className="flex flex-col gap-3 border-b border-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-base font-bold text-slate-900">Linked Cards</h2>
                <button onClick={addCard} className="inline-flex w-full items-center justify-center gap-1 text-xs font-bold text-blue-600 sm:w-auto">
                  <Plus className="h-4 w-4" /> Add New
                </button>
              </div>

              {configForm.cards.length === 0 ? (
                <div className="p-6 text-sm text-slate-400">No cards added yet.</div>
              ) : (
                <div className="grid gap-4 p-6 lg:grid-cols-2 xl:gap-5">
                  {configForm.cards.map(card => (
                    <div key={card.id} className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5">
                      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600">
                            <CreditCard className="h-5 w-5" />
                          </div>
                          <input
                            type="text"
                            value={card.name}
                            placeholder="Card Name"
                            onChange={e => updateCard(card.id, 'name', e.target.value)}
                            className="min-w-0 flex-1 border-none bg-transparent p-0 text-sm font-bold text-slate-900 focus:ring-0"
                          />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {confirmResyncId === card.id ? (
                            <button
                              onClick={() => handleResyncCard(card)}
                              className="rounded-lg bg-amber-100 px-3 py-1.5 text-[11px] font-bold text-amber-700"
                            >
                              Wipe &amp; re-sync?
                            </button>
                          ) : (
                            <button onClick={() => handleResyncCard(card)} title="Wipe and re-sync this card" className="p-2 text-slate-300 hover:text-blue-600">
                              <RefreshCw className={`h-5 w-5 ${syncingCardId === card.id ? 'animate-spin' : ''}`} />
                            </button>
                          )}
                          <button onClick={() => removeCard(card.id)} className="p-2 text-slate-300 hover:text-red-500">
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-slate-400">Bank</label>
                          <select
                            value={card.bank}
                            onChange={e => updateCard(card.id, 'bank', e.target.value)}
                            className="w-full rounded-lg border-none bg-white p-3 text-xs font-bold"
                          >
                            {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase text-slate-400" title="The last day included in that month's bill">Statement Closing Day</label>
                          <input
                            type="number"
                            min={1}
                            max={28}
                            value={card.startDay}
                            onChange={e => updateCard(card.id, 'startDay', Number(e.target.value))}
                            className="w-full rounded-lg border-none bg-white p-3 text-xs font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)] animate-in">
            <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
              <label className="mb-3 block text-[10px] font-black uppercase tracking-widest text-slate-400">Overall Monthly Budget</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</div>
                <input
                  type="number"
                  value={budgetForm.overall}
                  onChange={e => setBudgetForm(f => ({ ...f, overall: e.target.value }))}
                  className="h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-8 pr-4 text-lg font-black text-slate-900 outline-none"
                />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="border-b border-slate-50 p-6 font-bold text-slate-900">Budget by Category</div>
              <div className="grid gap-4 p-6 md:grid-cols-2">
                {CATEGORIES.map(cat => (
                  <div key={cat} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-4">
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-600">{cat}</span>
                    <div className="relative w-28 shrink-0">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</div>
                      <input
                        type="number"
                        value={budgetForm.byCategory?.[cat] || ''}
                        onChange={e => setBudgetForm(f => ({ ...f, byCategory: { ...f.byCategory, [cat]: Number(e.target.value) || '' } }))}
                        className="w-full rounded-xl border-none bg-white py-2 pl-6 pr-3 text-right text-sm font-bold text-slate-900"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        <Toast message={toast} />
      </div>
    </div>
  );
}
