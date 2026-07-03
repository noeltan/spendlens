import React, { useState, useRef, useEffect } from 'react';
import { 
  CheckCircle, 
  Plus, 
  Trash2, 
  RotateCcw, 
  ArrowRight, 
  Edit2,
  Landmark,
  AlertCircle
} from 'lucide-react';
import { triggerSync, fetchSyncState, triggerSetup } from '../api';

const STEP = {
  CURRENCY: 1,
  CARDS: 2,
  SYNC: 3
};

const BANKS = ['DBS', 'SCB', 'Citibank', 'UOB', 'HSBC', 'Maybank', 'AMEX'];

/**
 * SetupWizard Component
 * Optimized for Mobile UX with a clean, step-by-step flow.
 */
export default function SetupWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(STEP.CURRENCY);
  const [localCurrency, setLocalCurrency] = useState('SGD');
  const [cards, setCards] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  // ─── Card Management ───────────────────────────────────────────────────
  function addCard() {
    setCards([...cards, { id: crypto.randomUUID(), name: '', bank: 'DBS', startDay: 25 }]);
  }

  function removeCard(id) {
    setCards(cards.filter(c => c.id !== id));
  }

  function updateCard(id, field, value) {
    setCards(cards.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  // ─── Setup & Sync ──────────────────────────────────────────────────────
  async function handleFinishSetup() {
    if (cards.length === 0) {
      setError('Please add at least one card to continue.');
      return;
    }
    if (cards.some(c => !c.name.trim())) {
      setError('Please provide a name for all your cards.');
      return;
    }

    setError(null);
    setCurrentStep(STEP.SYNC);

    try {
      await triggerSetup({ localCurrency, cards });
      await triggerSync();

      pollRef.current = setInterval(async () => {
        try {
          const ss = await fetchSyncState();
          setProgress(ss?.progress || null);
          if (ss?.syncError) {
            clearInterval(pollRef.current);
            setError('Sync failed: ' + ss.syncError);
            setCurrentStep(STEP.CARDS);
          } else if (ss && !ss.progress && ss.lastSyncedAt) {
            clearInterval(pollRef.current);
            onComplete();
          }
        } catch (_) {}
      }, 2000);
    } catch (err) {
      if (pollRef.current) clearInterval(pollRef.current);
      setError('Setup failed: ' + err.message);
      setCurrentStep(STEP.CARDS);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 font-inter pb-24">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 px-4 h-16 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            S
          </div>
          <span className="font-bold text-slate-900 tracking-tight text-lg">SpendLens</span>
        </div>
        <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200">
           <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400">
             <Landmark className="w-5 h-5" />
           </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Setup Phase</p>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-900">
              {currentStep === STEP.CURRENCY ? 'Currency Selection' : currentStep === STEP.CARDS ? 'Card Management' : 'Syncing Data'}
            </h1>
            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-100">
              Step {currentStep} of 3
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-200 rounded-full mb-8 overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-500 ease-out" 
            style={{ width: `${(currentStep / 3) * 100}%` }}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-600 rounded-xl p-4 flex items-start gap-3 mb-6 animate-in">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {/* ── STEP 1: CURRENCY ── */}
        {currentStep === STEP.CURRENCY && (
           <section className="space-y-6">
             <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">Primary Currency</label>
                <div className="flex items-center gap-4">
                  <input
                    type="text"
                    maxLength={3}
                    value={localCurrency}
                    onChange={e => setLocalCurrency(e.target.value.toUpperCase())}
                    className="w-24 h-14 bg-slate-50 border border-slate-100 rounded-xl text-center text-xl font-bold text-slate-900 focus:ring-2 focus:ring-blue-100 outline-none"
                  />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    All transaction totals will be converted and displayed in <span className="font-bold text-slate-900">{localCurrency}</span>.
                  </p>
                </div>
             </div>
             <button 
               onClick={() => setCurrentStep(STEP.CARDS)} 
               className="w-full h-14 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-2"
             >
               Continue
               <ArrowRight className="w-5 h-5" />
             </button>
           </section>
        )}

        {/* ── STEP 2: CARDS ── */}
        {currentStep === STEP.CARDS && (
          <section className="space-y-6">
            {currentStep > STEP.CURRENCY && (
              <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-slate-400">1. Currency Selection</p>
                    <p className="font-semibold text-slate-700">{localCurrency}</p>
                  </div>
                </div>
                <button onClick={() => setCurrentStep(STEP.CURRENCY)} className="text-blue-600 font-semibold text-sm px-2 py-1 hover:bg-blue-50 rounded-lg transition-colors">
                  Edit
                </button>
              </div>
            )}

            <div className="flex items-center justify-between mb-4 mt-8">
              <h2 className="font-bold text-slate-900 text-lg">Connected Cards</h2>
              <button onClick={addCard} className="flex items-center gap-1.5 text-blue-600 font-bold text-sm">
                <Plus className="w-4 h-4" />
                Add New
              </button>
            </div>

            <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
              {cards.length === 0 && (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center text-center bg-white/50">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <Plus className="w-6 h-6 text-slate-400" />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-1">No cards added yet</h3>
                  <p className="text-xs text-slate-500">Add at least one card to start tracking your spending.</p>
                </div>
              )}
              {cards.map(card => (
                <div key={card.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-sm animate-in">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center">
                       <Landmark className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-grow">
                      <div className="flex gap-2 mb-2">
                        <select 
                          value={card.bank} 
                          onChange={e => updateCard(card.id, 'bank', e.target.value)}
                          className="text-xs font-bold bg-slate-50 border-none rounded-md px-2 py-1"
                        >
                          {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <input 
                          type="text" 
                          placeholder="Card name (e.g. Visa 1234)"
                          value={card.name}
                          onChange={e => updateCard(card.id, 'name', e.target.value)}
                          className="flex-grow text-sm font-bold text-slate-900 bg-transparent border-none p-0 focus:ring-0"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-medium text-slate-400">Billing Ends (Day):</label>
                        <input 
                          type="number" 
                          min={1} max={28}
                          value={card.startDay}
                          onChange={e => updateCard(card.id, 'startDay', Number(e.target.value))}
                          className="w-10 text-[10px] font-bold text-slate-700 bg-slate-50 border-none rounded px-1 text-center"
                        />
                      </div>
                    </div>
                    <button onClick={() => removeCard(card.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <footer className="sticky bottom-4 mt-6 flex gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-md">
              <button 
                onClick={() => setCurrentStep(STEP.CURRENCY)}
                className="flex-1 h-14 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
              >
                Back
              </button>
              <button 
                onClick={handleFinishSetup}
                className="flex-[2] h-14 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
              >
                Next: Sync Account
                <ArrowRight className="w-5 h-5" />
              </button>
            </footer>
          </section>
        )}

        {/* ── STEP 3: SYNCING ── */}
        {currentStep === STEP.SYNC && (
          <section className="space-y-8 py-12 text-center">
            <div className="w-20 h-20 bg-blue-50 border border-blue-100 rounded-3xl mx-auto flex items-center justify-center mb-6">
               <RotateCcw className={`w-10 h-10 text-blue-600 ${!progress || progress.stage !== 'done' ? 'animate-spin' : ''}`} />
            </div>
            
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                {progress ? (progress.stage === 'fetching' ? 'Reading Gmail...' : 'Parsing Transactions') : 'Connecting...'}
              </h2>
              <p className="text-sm text-slate-500 max-w-xs mx-auto">
                {progress ? `Processing ${progress.current} of ${progress.total} emails` : 'This may take a moment depending on your inbox volume.'}
              </p>
            </div>

            <div className="max-w-xs mx-auto">
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden mb-2">
                 <div 
                   className="h-full bg-blue-600 transition-all duration-500" 
                   style={{ width: `${progress ? Math.round((progress.current / progress.total) * 100) : 10}%` }} 
                 />
              </div>
              <span className="text-xs font-black text-blue-600">{progress ? Math.round((progress.current / progress.total) * 100) : 0}% COMPLETE</span>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
